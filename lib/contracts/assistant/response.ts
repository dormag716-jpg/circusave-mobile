import type { AssistantActionSuggestion } from './actions';

export type AssistantResponse = Readonly<{
  schemaVersion: 'assistant-response.v1';
  conversationId: string;
  message: string;
  explanationCodes: readonly string[];
  navigationSuggestions: readonly AssistantActionSuggestion[];
  generatedFromContextAt: string;
  actionsExecutable: false;
}>;
