import { Task, TaskCategory } from "../types";

// Define the structure for AI responses
interface AIResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text?: string;
        functionCall?: {
          name: string;
          args: any;
        };
      }>;
    };
  }>;
}

// Define the structure for function calls
interface FunctionCall {
  name: string;
  args: any;
}

// Define the structure for function declarations
interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
}

// Define the structure for tasks
interface TaskFunctionArgs {
  title: string;
  category: TaskCategory;
  duration: number;
  notes?: string;
  alarmTime?: string;
}

interface UpdateTaskArgs {
  taskTitle: string;
  notes: string;
  duration?: number;
}

interface SetAlarmArgs {
  taskTitle: string;
  time: string;
}

// Function declarations for AI tools
export const controlTaskFunctions: FunctionDeclaration[] = [
  {
    name: 'create_task',
    description: 'Create a new task in the system with an estimated duration and optional alarm.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The title of the task' },
        category: { type: 'string', enum: Object.values(TaskCategory) },
        duration: { type: 'number', description: 'Estimated duration in minutes based on task complexity' },
        notes: { type: 'string', description: 'Detailed advice or sub-steps for this task' },
        alarmTime: { type: 'string', description: 'Best time to start this task in HH:mm format' }
      },
      required: ['title', 'category', 'duration']
    }
  },
  {
    name: 'update_task_notes',
    description: 'Update the notes or duration for an existing task to improve scheduling.',
    parameters: {
      type: 'object',
      properties: {
        taskTitle: { type: 'string', description: 'The title of the task to update' },
        notes: { type: 'string', description: 'New advice or updated steps' },
        duration: { type: 'number', description: 'Revised duration in minutes' }
      },
      required: ['taskTitle', 'notes']
    }
  },
  {
    name: 'set_alarm',
    description: 'Set a specific reminder time for a task.',
    parameters: {
      type: 'object',
      properties: {
        taskTitle: { type: 'string', description: 'The title of the task' },
        time: { type: 'string', description: 'Time in HH:mm format' }
      },
      required: ['taskTitle', 'time']
    }
  }
];

// Define the structure for optimization schema
const OPTIMIZE_SCHEMA = {
  type: 'object',
  properties: {
    optimizedTasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          priority: { type: 'string' },
          estimatedDuration: { type: 'number' },
          reasoning: { type: 'string' }
        },
        required: ["id", "priority", "estimatedDuration"]
      }
    },
    advice: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        recommendations: { type: 'array', items: { type: 'string' } },
        focusScore: { type: 'number' }
      },
      required: ["summary", "recommendations", "focusScore"]
    }
  },
  required: ["optimizedTasks", "advice"]
};

// AI Provider interface
interface AIProvider {
  generateContent(prompt: string, systemInstruction?: string, tools?: any[]): Promise<AIResponse>;
  generateJSON(prompt: string, schema?: any): Promise<any>;
}

// Google Gemini AI Provider
class GeminiProvider implements AIProvider {
  private apiKey: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateContent(prompt: string, systemInstruction?: string, tools?: any[]): Promise<AIResponse> {
    const model = "gemini-pro";
    const requestBody = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
      tools: tools ? [{ functionDeclarations: tools }] : undefined,
    };

    const response = await fetch(`${this.baseUrl}/${model}:generateContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async generateJSON(prompt: string, schema?: any): Promise<any> {
    const model = "gemini-pro";
    const requestBody = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    };

    const response = await fetch(`${this.baseUrl}/${model}:generateContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return JSON.parse(result.candidates[0].content.parts[0].text);
  }
}

// OpenAI Provider
class OpenAIProvider implements AIProvider {
  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateContent(prompt: string, systemInstruction?: string, tools?: any[]): Promise<AIResponse> {
    const messages = [
      ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
      { role: 'user', content: prompt }
    ];

    const requestBody: any = {
      model: "gpt-3.5-turbo",
      messages: messages,
      temperature: 0.7,
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      }));
      requestBody.tool_choice = "auto";
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Convert OpenAI response to our AIResponse format
    const result: AIResponse = {
      candidates: [{
        content: {
          parts: data.choices[0].message.tool_calls 
            ? data.choices[0].message.tool_calls.map((call: any) => ({
                functionCall: {
                  name: call.function.name,
                  args: JSON.parse(call.function.arguments)
                }
              }))
            : [{ text: data.choices[0].message.content }]
        }
      }]
    };
    
    return result;
  }

  async generateJSON(prompt: string, schema?: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  }
}

// Main AI Service class
class AIService {
  private provider: AIProvider;

  constructor() {
    this.provider = this.createProvider();
  }

  private createProvider(): AIProvider {
    const aiProvider = localStorage.getItem('aiProvider') || 'gemini'; // Default to gemini
    const apiKey = this.getApiKey(aiProvider);

    if (!apiKey) {
      // Return a mock provider that shows an error message
      return {
        generateContent: async (prompt: string, systemInstruction?: string, tools?: any[]): Promise<AIResponse> => {
          throw new Error(`API key not found for provider: ${aiProvider}. Please configure your API settings in the Settings panel.`);
        },
        generateJSON: async (prompt: string, schema?: any): Promise<any> => {
          throw new Error(`API key not found for provider: ${aiProvider}. Please configure your API settings in the Settings panel.`);
        }
      } as AIProvider;
    }

    switch (aiProvider.toLowerCase()) {
      case 'openai':
        return new OpenAIProvider(apiKey);
      case 'gemini':
      default:
        return new GeminiProvider(apiKey);
    }
  }

  private getApiKey(provider: string): string | null {
    switch (provider.toLowerCase()) {
      case 'openai':
        return localStorage.getItem('openai_api_key') || localStorage.getItem('aiApiKey') || null;
      case 'gemini':
      default:
        return localStorage.getItem('gemini_api_key') || localStorage.getItem('aiApiKey') || null;
    }
  }

  // Method to update the provider when settings change
  updateProvider() {
    this.provider = this.createProvider();
  }

  async getResponse(userMessage: string, currentTasks: Task[], systemInstruction?: string, tools?: any[]): Promise<AIResponse> {
    const context = `Current Tasks Context: ${JSON.stringify(currentTasks)}.`;
    const fullPrompt = `${userMessage}\n\n${context}`;
    
    return await this.provider.generateContent(
      fullPrompt,
      systemInstruction,
      tools
    );
  }

  async generateJSON(prompt: string, schema?: any): Promise<any> {
    return await this.provider.generateJSON(prompt, schema);
  }
}

// Create a singleton instance
const aiService = new AIService();

export const getAIResponse = async (userMessage: string, currentTasks: Task[]) => {
  try {
    const systemInstruction = `You are ZenTime AI, a world-class expert in time management and scheduling.

      CRITICAL BEHAVIOR:
      1. If a user lists multiple goals, call 'create_task' for each one, providing logical durations and categories.
      2. ALWAYS suggest a 'notes' field containing a mini-plan (sub-steps) for the task.
      3. If the user asks to "optimize" or "schedule" their day, look at currentTasks and suggest better start times (alarms) or durations.
      4. Be proactive: If a task sounds difficult, give it more time. If it's a quick win, give it 15-30 mins.

      Current Tasks Context: ${JSON.stringify(currentTasks)}.
      Style: Professional, encouraging, and highly organized.`;

    return await aiService.getResponse(
      userMessage,
      currentTasks,
      systemInstruction,
      controlTaskFunctions
    );
  } catch (error) {
    // Re-throw the error to be handled by the calling function
    throw error;
  }
};

export const optimizeSchedule = async (tasks: Task[]): Promise<any> => {
  try {
    const prompt = `Act as a productivity coach. Analyze these tasks and provide a JSON optimization plan: ${JSON.stringify(tasks)}. Suggest better priorities and durations to improve quality of life.`;
    return await aiService.generateJSON(prompt, OPTIMIZE_SCHEMA);
  } catch (error) {
    // Re-throw the error to be handled by the calling function
    throw error;
  }
};