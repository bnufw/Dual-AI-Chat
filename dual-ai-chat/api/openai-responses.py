import json
import os
import time
from http.server import BaseHTTPRequestHandler

from openai import APITimeoutError, APIConnectionError, APIStatusError, AuthenticationError, OpenAI, RateLimitError

DEFAULT_REASONING_EFFORT = os.getenv("OPENAI_COMPAT_REASONING_EFFORT", "xhigh")
LEGACY_MAX_OUTPUT_TOKENS = int(os.getenv("OPENAI_COMPAT_MAX_OUTPUT_TOKENS", "2200"))
DEFAULT_INTERNAL_MAX_OUTPUT_TOKENS = int(
    os.getenv("OPENAI_COMPAT_INTERNAL_MAX_OUTPUT_TOKENS", str(min(1200, LEGACY_MAX_OUTPUT_TOKENS)))
)
DEFAULT_FINAL_MAX_OUTPUT_TOKENS = int(
    os.getenv("OPENAI_COMPAT_FINAL_MAX_OUTPUT_TOKENS", str(min(2200, LEGACY_MAX_OUTPUT_TOKENS)))
)
DEFAULT_TIMEOUT_SECONDS = float(os.getenv("OPENAI_COMPAT_TIMEOUT_SECONDS", "45"))
DEFAULT_MAX_RETRIES = int(os.getenv("OPENAI_COMPAT_MAX_RETRIES", "0"))


def normalize_base_url(base_url: str) -> str:
    normalized = base_url.rstrip("/")
    if normalized.endswith("/responses"):
        return normalized[: -len("/responses")]
    return normalized


def extract_response_text(response) -> str:
    output_text = getattr(response, "output_text", "")
    if isinstance(output_text, str) and output_text.strip():
        return output_text

    payload = response.model_dump()
    output = payload.get("output")
    if not isinstance(output, list):
        return ""

    parts: list[str] = []
    for item in output:
        contents = item.get("content")
        if not isinstance(contents, list):
            continue
        for content in contents:
            if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                parts.append(content["text"])
    return "".join(parts)


def get_openai_settings(role: str) -> dict[str, str]:
    normalized_role = role.lower()
    if normalized_role not in {"cognito", "muse"}:
        raise ValueError("Invalid role")

    base_url = os.getenv("OPENAI_COMPAT_BASE_URL", "").strip()
    api_key = os.getenv("OPENAI_COMPAT_API_KEY", "").strip()

    if not base_url or not api_key:
        raise RuntimeError("Server-side OpenAI-compatible config is incomplete.")

    return {
        "base_url": normalize_base_url(base_url),
        "api_key": api_key,
    }


def get_request_timeout_seconds() -> float:
    if DEFAULT_TIMEOUT_SECONDS <= 0:
        return 45.0
    return DEFAULT_TIMEOUT_SECONDS


def get_request_retries() -> int:
    if DEFAULT_MAX_RETRIES < 0:
        return 0
    return DEFAULT_MAX_RETRIES


def get_max_output_tokens(purpose: str) -> int:
    normalized_purpose = purpose.strip().lower()
    if normalized_purpose == "final-response":
        return max(256, DEFAULT_FINAL_MAX_OUTPUT_TOKENS)
    return max(256, DEFAULT_INTERNAL_MAX_OUTPUT_TOKENS)


def build_input(prompt: str, image_part: dict | None) -> list[dict]:
    content: list[dict] = [{"type": "input_text", "text": prompt}]
    if image_part:
        content.append(
            {
                "type": "input_image",
                "image_url": {
                    "url": f"data:{image_part['mimeType']};base64,{image_part['data']}",
                },
            }
        )
    return [{"role": "user", "content": content}]


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        started_at = time.perf_counter()

        try:
            raw_body = self.rfile.read(int(self.headers.get("Content-Length", "0") or 0))
            body = json.loads(raw_body.decode("utf-8") or "{}")
            role = str(body.get("role", "")).strip()
            model_id = str(body.get("modelId", "")).strip()
            purpose = str(body.get("purpose", "")).strip()
            reasoning_effort = str(body.get("reasoningEffort", DEFAULT_REASONING_EFFORT)).strip().lower()
            prompt = str(body.get("prompt", "")).strip()
            system_instruction = body.get("systemInstruction")
            image_part = body.get("imagePart")

            if not prompt:
                self._send_json(400, {"text": "请求缺少 prompt。", "error": "Bad request", "durationMs": 0})
                return
            if not model_id:
                self._send_json(400, {"text": "请求缺少 modelId。", "error": "Bad request", "durationMs": 0})
                return
            if reasoning_effort not in {"low", "medium", "high", "xhigh"}:
                self._send_json(400, {"text": "请求里的 reasoningEffort 无效。", "error": "Bad request", "durationMs": 0})
                return

            settings = get_openai_settings(role)
            request_timeout_seconds = get_request_timeout_seconds()
            max_output_tokens = get_max_output_tokens(purpose)
            client = OpenAI(
                api_key=settings["api_key"],
                base_url=settings["base_url"],
                timeout=request_timeout_seconds,
                max_retries=get_request_retries(),
            )

            request_body = {
                "model": model_id,
                "input": build_input(prompt, image_part if isinstance(image_part, dict) else None),
                "reasoning": {"effort": reasoning_effort or DEFAULT_REASONING_EFFORT},
                "max_output_tokens": max_output_tokens,
                "timeout": request_timeout_seconds,
            }
            if isinstance(system_instruction, str) and system_instruction.strip():
                request_body["instructions"] = system_instruction

            response = client.responses.create(**request_body)
            text = extract_response_text(response)

            if not text:
                self._send_json(
                    502,
                    {
                        "text": "AI响应格式无效。",
                        "error": "Invalid response structure",
                        "durationMs": self._duration_ms(started_at),
                    },
                )
                return

            self._send_json(
                200,
                {
                    "text": text,
                    "durationMs": self._duration_ms(started_at),
                },
            )
        except RuntimeError as error:
            self._send_json(
                500,
                {
                    "text": f"服务端 OpenAI 兼容配置不完整: {error}",
                    "error": "API key not configured",
                    "durationMs": self._duration_ms(started_at),
                },
            )
        except ValueError as error:
            self._send_json(
                400,
                {
                    "text": f"请求无效: {error}",
                    "error": "Bad request",
                    "durationMs": self._duration_ms(started_at),
                },
            )
        except AuthenticationError as error:
            self._send_json(
                getattr(error, "status_code", 401) or 401,
                {
                    "text": "服务端 OpenAI 兼容密钥无效或权限不足。",
                    "error": "API key invalid or permission denied",
                    "durationMs": self._duration_ms(started_at),
                },
            )
        except RateLimitError as error:
            self._send_json(
                getattr(error, "status_code", 429) or 429,
                {
                    "text": "API 配额已超出。",
                    "error": "Quota exceeded",
                    "durationMs": self._duration_ms(started_at),
                },
            )
        except APITimeoutError as error:
            self._send_json(
                504,
                {
                    "text": (
                        f"上游 OpenAI 兼容服务在 {get_request_timeout_seconds():g} 秒内未返回。"
                        "这通常会触发 Vercel 的通用 deployment timeout。"
                        f"当前该步骤的 max_output_tokens 为 {max_output_tokens}。"
                        "这更像是上游 Base URL 响应过慢，或该兼容服务不适合这种非流式多轮对话请求。"
                    ),
                    "error": "OpenAI request timeout",
                    "durationMs": self._duration_ms(started_at),
                },
            )
        except APIConnectionError as error:
            self._send_json(
                502,
                {
                    "text": f"连接上游 OpenAI 兼容服务失败: {error}",
                    "error": "API connection failed",
                    "durationMs": self._duration_ms(started_at),
                },
            )
        except APIStatusError as error:
            self._send_json(
                getattr(error, "status_code", 502) or 502,
                {
                    "text": str(error),
                    "error": "OpenAI API error",
                    "durationMs": self._duration_ms(started_at),
                },
            )
        except Exception as error:
            self._send_json(
                500,
                {
                    "text": f"服务端处理 OpenAI 请求时出错: {error}",
                    "error": "Internal server error",
                    "durationMs": self._duration_ms(started_at),
                },
            )

    def _duration_ms(self, started_at: float) -> float:
        return round((time.perf_counter() - started_at) * 1000, 2)

    def _send_json(self, status_code: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
