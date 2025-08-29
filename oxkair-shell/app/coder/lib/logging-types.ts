import { ProcessingError } from '../../../lib/agents/newtypes';
import { StandardizedAgentResult, StandardizedAgentContext } from '../../../lib/agents/newtypes';
import { WorkflowLogger } from './logging';

export interface ExecutionTrace {
  type: 'agent_start' | 'agent_end' | 'api_call_start' | 'api_call_end' | 'orchestrator_step' | 'state_transition';
  component: string;
  stepId?: string;
  timestamp: number;
  metadata?: any;
  success?: boolean;
}

export interface ExecutionSummary {
  workflowId: string;
  totalExecutionTime: number;
  totalSteps: number;
  agentExecutions: number;
  apiCalls: number;
  agentMetrics: any;
  apiMetrics: any;
  executionTrace: ExecutionTrace[];
  performanceMetrics: any;
  totalAiCost: number;
}

export interface IPerformanceMetrics {
  add(component: string, metrics: any): void;
  getCumulative(): any;
  getAll(): any;
}

export class PerformanceMetrics implements IPerformanceMetrics {
    private metrics: Map<string, any[]> = new Map();
    private cumulative: Record<string, number> = {};

    add(component: string, metrics: any): void {
        if (!this.metrics.has(component)) {
            this.metrics.set(component, []);
        }
        this.metrics.get(component)!.push(metrics);

        for (const key in metrics) {
            if (typeof metrics[key] === 'number') {
                this.cumulative[key] = (this.cumulative[key] || 0) + metrics[key];
            }
        }
    }

    getCumulative(): any {
        return this.cumulative;
    }

    getAll(): any {
        const allMetrics: Record<string, any[]> = {};
        for (const [key, value] of this.metrics.entries()) {
            allMetrics[key] = value;
        }
        return allMetrics;
    }
}


export interface LoggedAgentExecutionContext extends StandardizedAgentContext {
  logger: WorkflowLogger;
  stepId?: string;
  parentStepId?: string;
  dependencies?: string[];
  requiredServices?: string[]; // Updated to use string[] instead of keyof ServiceRegistry
}