import { AbstractGenerator } from "./AbstractGenerator";
import { StateMachine } from "../StateMachine";
import * as fields from '../fields';
import * as states from '../states';


const ComparatorRuleMap = {
    [states.CHOICE_COMPARATOR_RULE.STRING_EQUALS]: 'StringEquals',
    [states.CHOICE_COMPARATOR_RULE.STRING_LESS_THAN]: 'StringLessThan',
    [states.CHOICE_COMPARATOR_RULE.STRING_GREATER_THAN]: 'StringGreaterThan',
    [states.CHOICE_COMPARATOR_RULE.STRING_LESS_THAN_EQUALS]: 'StringLessThanEquals',
    [states.CHOICE_COMPARATOR_RULE.STRING_GREATER_THAN_EQUALS]: 'StringGreaterThanEquals',
    [states.CHOICE_COMPARATOR_RULE.NUMERIC_EQUALS]: 'NumericEquals',
    [states.CHOICE_COMPARATOR_RULE.NUMERIC_LESS_THAN]: 'NumericLessThan',
    [states.CHOICE_COMPARATOR_RULE.NUMERIC_GREATER_THAN]: 'NumericGreaterThan',
    [states.CHOICE_COMPARATOR_RULE.NUMERIC_LESS_THAN_EQUALS]: 'NumericLessThanEquals',
    [states.CHOICE_COMPARATOR_RULE.NUMERIC_GREATER_THAN_EQUALS]: 'NumericGreaterThanEquals',
    [states.CHOICE_COMPARATOR_RULE.BOOLEAN_EQUALS]: 'BooleanEquals',
    [states.CHOICE_COMPARATOR_RULE.TIMESTAMP_EQUALS]: 'TimestampEquals',
    [states.CHOICE_COMPARATOR_RULE.TIMESTAMP_LESS_THAN]: 'TimestampLessThan',
    [states.CHOICE_COMPARATOR_RULE.TIMESTAMP_GREATER_THAN]: 'TimestampGreaterThan',
    [states.CHOICE_COMPARATOR_RULE.TIMESTAMP_LESS_THAN_EQUALS]: 'TimestampLessThanEquals',
    [states.CHOICE_COMPARATOR_RULE.TIMESTAMP_GREATER_THAN_EQUALS]: 'TimestampGreaterThanEquals',
};

const LogicRuleMap = {
    [states.CHOICE_LOGIC_RULE.AND]: 'And',
    [states.CHOICE_LOGIC_RULE.OR]: 'Or',
    [states.CHOICE_LOGIC_RULE.NOT]: 'Not',
}

export class StepFunctionsGenerator extends AbstractGenerator {
    generateStateMachine(stateMachine: StateMachine) {
        const data = {
            StartAt: stateMachine.getStartState().getName(),
            States: {}
        };
        if (stateMachine.getComment()) {
            data['Comment'] = stateMachine.getComment();
        }
        if (stateMachine.getTimeout()) {
            data['TimeoutSeconds'] = stateMachine.getTimeout();
        }
        if (stateMachine.getVersion()) {
            data['Version'] = stateMachine.getVersion();
        }
        data.States = stateMachine.getStates().reduce((states, state) => {
            states[state.getName()] = this.generateState(state);
            return states;
        }, {});
        return data;
    }
    generateNextField(field: fields.NextField<any>): Object {
        if (field.isEnd()) {
            return { End: true };
        } else {
            return { Next: field.nextStateName() };
        }
    }
    generatePathField(field: fields.PathField<any>): Object {
        let data: any = {};

        if (field.getInput()) {
            data['InputPath'] = field.getInput();
        }
        if (field.getOutput()) {
            data['OutputPath'] = field.getOutput();
        }
        return data;
    }

    generateResultField(field: fields.ResultField<any>): Object {
        return { Result: field.getAll() };
    }

    generateResultPathField(field: fields.ResultPathField<any>): Object {
        return {
            ResultPath: field.get()
        }
    }

    generateRetryField(field: fields.RetryField<any>): Object {
        return {
            Retry: field.getRetries().map((retrier) => {
                let retrierData = {
                    ErrorEquals: retrier.getErrorTypes(),
                }
                if (retrier.getMaxAttempts() !== null) {
                    Object.assign(retrierData, { MaxAttempts: retrier.getMaxAttempts() });
                }
                if (retrier.getBackoffRate() !== null) {
                    Object.assign(retrierData, { BackoffRate: retrier.getBackoffRate() });
                }
                if (retrier.getMaxAttempts() !== null) {
                    Object.assign(retrierData, { MaxAttempts: retrier.getMaxAttempts() });
                }
                if (retrier.getInterval() !== null) {
                    Object.assign(retrierData, { IntervalSeconds: retrier.getInterval() });
                }
                return retrierData;
            })
        }
    }

    generateCatchField(field: fields.CatchField<any>): Object {
        return {
            Catch: field.getCatchers().map((cacher) => {
                let cacherData = {
                    ErrorEquals: cacher.getErrors()
                };
                Object.assign(cacherData, this.generateNextField(cacher.next));
                if (cacher.resultPath.isConfigured()) {
                    Object.assign(cacherData, this.generateResultPathField(cacher.resultPath));
                }
                return cacherData;
            })
        }
    }

    generateParallel(state: states.Parallel): Object {
        const data = {
            Type: 'Parallel'
        };
        data['Branches'] = state.getBranches().map((branch) => {
            return {
                StartAt: branch.getStartAt().getName(),
                States: branch.getStates().reduce((data, state: states.State) => {
                    data[state.getName()] = this.generateState(state);
                    return data;
                }, {})
            };
        });
        return data;
    }

    private generateChoiceOperation(operation: states.ChoiceOperation) {
        let data = {};
        if (operation instanceof states.ChoiceLogicOperation) {
            const rule = operation.getRule();
            let ruleKeyword = LogicRuleMap[operation.getRule()];
            if (rule === states.CHOICE_LOGIC_RULE.NOT) {
                data[ruleKeyword] = this.generateChoiceOperation(operation.getOperations()[0]);
            } else {
                data[ruleKeyword] = operation.getOperations().map((operation) => {
                    return this.generateChoiceOperation(operation);
                });
            }
        } else if (operation instanceof states.ChoiceComparatorOperation) {
            let RuleKeyword = ComparatorRuleMap[operation.getRule()];
            data[RuleKeyword] = operation.getValue();
            data['Variable'] = operation.getVariable();
        }

        if (operation.next) {
            data = Object.assign(data, this.generateNextField(operation.next));
        }

        return data;
    }

    generateChoice(state: states.Choice) {
        const data = {
            Type: 'Choice'
        };

        data['Choices'] = state.getOperations().map((operator) => {
            return this.generateChoiceOperation(operator);
        });

        const defaultState = state.getDefault();
        if (defaultState !== null) {
            data['Default'] = defaultState.getName();
        }
        return data;
    }

    generatePass(state: states.Pass): Object {
        return {
            Type: 'Pass'
        }
    }

    generateTask(task: states.Task): Object {
        let data = {
            Type: 'Task',
            Resource: task.getResource()
        };

        if (task.getHeartbeat() !== null) {
            data['HeartbeatSeconds'] = task.getHeartbeat();
        }

        if (task.getTimeout() !== null) {
            data['TimeoutSeconds'] = task.getTimeout();
        }

        return data;
    }

    generateState(state: states.State) {
        let data = this.getMethodTarget(state).call(this, state);
        const validationErrors = state.validate();
        if (validationErrors.length) {
            throw validationErrors[0];
        }
        return state.getFields()
            .filter((field) => field.isConfigured())
            .reduce((result, field) => {
                return Object.assign(result, this.generateField(field));
            }, data);
    }
}