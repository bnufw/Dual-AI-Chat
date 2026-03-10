
import { useState, useCallback, useMemo, useEffect } from 'react';
import { MessageSender, MessagePurpose } from '../types';
import { applyNotepadModifications, ParsedAIResponse } from '../utils/appUtils';
import {
  INITIAL_NOTEPAD_CONTENT,
  NOTEPAD_CONTENT_STORAGE_KEY,
  NOTEPAD_HISTORY_STORAGE_KEY,
  NOTEPAD_HISTORY_INDEX_STORAGE_KEY,
} from '../constants';

type PersistedNotepadState = {
  content: string;
  history: string[];
  historyIndex: number;
};

const parseStoredHistory = (rawHistory: string | null): string[] | null => {
  if (!rawHistory) return null;
  try {
    const parsed = JSON.parse(rawHistory);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : null;
  } catch {
    return null;
  }
};

const getInitialNotepadState = (initialContent: string): PersistedNotepadState => {
  const savedContent = localStorage.getItem(NOTEPAD_CONTENT_STORAGE_KEY);
  const content = savedContent ?? initialContent;
  const storedHistory = parseStoredHistory(localStorage.getItem(NOTEPAD_HISTORY_STORAGE_KEY));

  if (!storedHistory || storedHistory.length === 0) {
    return {
      content,
      history: [content],
      historyIndex: 0,
    };
  }

  const parsedIndex = Number(localStorage.getItem(NOTEPAD_HISTORY_INDEX_STORAGE_KEY));
  let historyIndex = Number.isInteger(parsedIndex) && parsedIndex >= 0 && parsedIndex < storedHistory.length
    ? parsedIndex
    : storedHistory.length - 1;
  let history = storedHistory;

  if (history[historyIndex] !== content) {
    history = [...history.slice(0, historyIndex + 1), content];
    historyIndex = history.length - 1;
  }

  return {
    content,
    history,
    historyIndex,
  };
};

export const useNotepadLogic = (initialContent: string = INITIAL_NOTEPAD_CONTENT) => {
  const [initialState] = useState<PersistedNotepadState>(() => getInitialNotepadState(initialContent));
  const [notepadContent, setNotepadContent] = useState<string>(initialState.content);
  const [lastNotepadUpdateBy, setLastNotepadUpdateBy] = useState<MessageSender | null>(null);
  
  const [notepadHistory, setNotepadHistory] = useState<string[]>(initialState.history);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState<number>(initialState.historyIndex);

  // Persist notepad content changes
  useEffect(() => {
    localStorage.setItem(NOTEPAD_CONTENT_STORAGE_KEY, notepadContent);
  }, [notepadContent]);

  useEffect(() => {
    localStorage.setItem(NOTEPAD_HISTORY_STORAGE_KEY, JSON.stringify(notepadHistory));
  }, [notepadHistory]);

  useEffect(() => {
    localStorage.setItem(NOTEPAD_HISTORY_INDEX_STORAGE_KEY, String(currentHistoryIndex));
  }, [currentHistoryIndex]);

  // Derived state for comparison
  const previousContent = useMemo(() => {
    return currentHistoryIndex > 0 ? notepadHistory[currentHistoryIndex - 1] : notepadContent;
  }, [currentHistoryIndex, notepadHistory, notepadContent]);

  const _addHistoryEntry = useCallback((newContent: string, updatedBy: MessageSender | null) => {
    const newHistorySlice = notepadHistory.slice(0, currentHistoryIndex + 1);
    const newFullHistory = [...newHistorySlice, newContent];
    
    setNotepadContent(newContent);
    setNotepadHistory(newFullHistory);
    setCurrentHistoryIndex(newFullHistory.length - 1);
    setLastNotepadUpdateBy(updatedBy);
  }, [notepadHistory, currentHistoryIndex]);

  const processNotepadUpdateFromAI = useCallback((
    parsedResponse: ParsedAIResponse,
    sender: MessageSender,
    addSystemMessage: (text: string, sender: MessageSender, purpose: MessagePurpose) => void
  ): string | null => {
    const update = parsedResponse.notepadUpdate;
    if (!update) return null;

    let aiFeedbackMsg: string | null = null;
    let currentNotepadForModification = notepadContent;
    // If we are in a past history state, apply modifications based on that state for accuracy,
    // then it will become a new history entry.
    if (currentHistoryIndex < notepadHistory.length - 1) {
        currentNotepadForModification = notepadHistory[currentHistoryIndex];
    }


    if (update.modifications && update.modifications.length > 0) {
      const { newContent, errors: applyErrors } = applyNotepadModifications(currentNotepadForModification, update.modifications);
      _addHistoryEntry(newContent, sender);
      
      if (applyErrors.length > 0) {
        const errorText = `[系统] ${sender} 的部分记事本修改操作未成功执行:\n- ${applyErrors.join('\n- ')}`;
        addSystemMessage(errorText, MessageSender.System, MessagePurpose.SystemNotification);
        aiFeedbackMsg = `[System Error] Notepad update failed: ${applyErrors.join('; ')}`;
      }
    }
    
    if (update.error) { 
      addSystemMessage(
        `[系统] ${sender} 尝试修改记事本时遇到问题: ${update.error}`,
        MessageSender.System,
        MessagePurpose.SystemNotification
      );
      if (!aiFeedbackMsg) {
          aiFeedbackMsg = `[System Error] Notepad update parsing failed: ${update.error}`;
      }
    }
    return aiFeedbackMsg;
  }, [notepadContent, _addHistoryEntry, currentHistoryIndex, notepadHistory]);

  const updateNotepadManual = useCallback((newContent: string) => {
    if (newContent !== notepadContent) {
      _addHistoryEntry(newContent, MessageSender.User);
    }
  }, [notepadContent, _addHistoryEntry]);

  const clearNotepadContent = useCallback(() => {
    _addHistoryEntry(initialContent, null);
  }, [initialContent, _addHistoryEntry]);

  const undoNotepad = useCallback(() => {
    if (currentHistoryIndex > 0) {
      const newIndex = currentHistoryIndex - 1;
      setCurrentHistoryIndex(newIndex);
      setNotepadContent(notepadHistory[newIndex]);
      setLastNotepadUpdateBy(null); // Or determine from history if stored
    }
  }, [currentHistoryIndex, notepadHistory]);

  const redoNotepad = useCallback(() => {
    if (currentHistoryIndex < notepadHistory.length - 1) {
      const newIndex = currentHistoryIndex + 1;
      setCurrentHistoryIndex(newIndex);
      setNotepadContent(notepadHistory[newIndex]);
      setLastNotepadUpdateBy(null); // Or determine from history if stored
    }
  }, [currentHistoryIndex, notepadHistory]);

  const canUndo = currentHistoryIndex > 0;
  const canRedo = currentHistoryIndex < notepadHistory.length - 1;

  return {
    notepadContent,
    previousContent,
    lastNotepadUpdateBy,
    processNotepadUpdateFromAI,
    updateNotepadManual,
    clearNotepadContent,
    // setNotepadContent is no longer exposed directly for external modification without history tracking
    undoNotepad,
    redoNotepad,
    canUndo,
    canRedo,
  };
};
