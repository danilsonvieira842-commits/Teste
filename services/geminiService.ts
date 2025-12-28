
import { GoogleGenAI, Type } from "@google/genai";
import { AISuggestion, Priority, BoardData, PrioritizationResult, DeadlinePredictionResult, Task } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateTasksFromPrompt = async (prompt: string, lang: string = 'en'): Promise<AISuggestion[]> => {
  const langText = lang === 'pt' ? 'Portuguese' : 'English';
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate a list of actionable tasks in ${langText} for the following goal: "${prompt}". Return as a JSON array. Each task should have a title, description, priority (low, medium, high), 1-2 tags, and an optional dueDate (ISO 8601 string).`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            priority: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            dueDate: { type: Type.STRING }
          },
          required: ["title", "description", "priority", "tags"]
        }
      }
    }
  });

  try {
    const jsonStr = (response.text || '[]').trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Failed to parse AI response", e);
    return [];
  }
};

export const breakdownTaskIntoSubtasks = async (title: string, description: string, lang: string = 'en'): Promise<string[]> => {
  const langText = lang === 'pt' ? 'Portuguese' : 'English';
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Break down this task into 3-5 small, actionable subtask titles in ${langText}: Task: ${title}. Description: ${description}. Return as a JSON array of strings.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });

  try {
    const jsonStr = (response.text || '[]').trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Failed to parse subtasks", e);
    return [];
  }
};

export const analyzeBoardProductivity = async (boardContext: string, lang: string = 'en'): Promise<string> => {
  const langText = lang === 'pt' ? 'Portuguese' : 'English';
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze the following Kanban board status (JSON) and give a 2-sentence productivity insight in ${langText}. Mention if tasks are overdue: ${boardContext}`,
  });
  return response.text || "No insights available yet.";
};

export const prioritizeBoardWithAI = async (boardData: BoardData, criteria: string, lang: string = 'en'): Promise<PrioritizationResult> => {
  const langText = lang === 'pt' ? 'Portuguese' : 'English';
  const context = JSON.stringify({
    tasks: Object.values(boardData.tasks).map(t => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      dueDate: t.dueDate,
      tags: t.tags,
      complexity: t.complexity || 3,
      col: Object.keys(boardData.columns).find(cid => boardData.columns[cid].taskIds.includes(t.id))
    })),
    columns: boardData.columns
  });

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: `As a project management expert, reorder the tasks in each column of this Kanban board based on these criteria: "${criteria}".
    The board data: ${context}.
    Return a JSON object with:
    1. 'columnOrders': record of column IDs to an array of task IDs in the new optimized order.
    2. 'priorityChanges': record of task IDs to their new suggested Priority (low, medium, high).
    3. 'insight': A 1-sentence explanation in ${langText} of why you reordered them this way.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          columnOrders: { type: Type.OBJECT, additionalProperties: { type: Type.ARRAY, items: { type: Type.STRING } } },
          priorityChanges: { type: Type.OBJECT, additionalProperties: { type: Type.STRING, enum: ['low', 'medium', 'high'] } },
          insight: { type: Type.STRING }
        },
        required: ["columnOrders", "priorityChanges", "insight"]
      }
    }
  });

  try {
    return JSON.parse((response.text || '{}').trim());
  } catch (e) {
    console.error("Failed to parse prioritization", e);
    throw e;
  }
};

export const predictTaskDeadline = async (task: Task, boardData: BoardData, lang: string = 'en'): Promise<DeadlinePredictionResult> => {
  const langText = lang === 'pt' ? 'Portuguese' : 'English';
  const tasksList = Object.values(boardData.tasks);
  
  // Basic workload calculation for context
  const workloadContext = tasksList.reduce((acc: any, t) => {
    const isDone = boardData.columns['col-3'].taskIds.includes(t.id);
    if (!isDone && t.assigneeId) {
      acc[t.assigneeId] = (acc[t.assigneeId] || 0) + 1;
    }
    return acc;
  }, {});

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Predict a realistic completion date for this task based on team workload and priority.
    Task to predict: ${JSON.stringify({ title: task.title, description: task.description, priority: task.priority, tags: task.tags, assigneeId: task.assigneeId })}
    Team workload (number of active tasks per user): ${JSON.stringify(workloadContext)}
    Current date: ${new Date().toISOString()}
    Language for reasoning: ${langText}
    Return as a JSON object with 'suggestedDate' (ISO string) and 'reasoning' (1-sentence).`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          suggestedDate: { type: Type.STRING },
          reasoning: { type: Type.STRING }
        },
        required: ["suggestedDate", "reasoning"]
      }
    }
  });

  try {
    return JSON.parse((response.text || '{}').trim());
  } catch (e) {
    console.error("Failed to predict deadline", e);
    throw e;
  }
};
