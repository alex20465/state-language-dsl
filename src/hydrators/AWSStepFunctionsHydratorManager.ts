import * as hydrators from './aws';
import * as states from '../states';
import * as fields from '../fields';
import { AbstractHydratorManager } from './AbstractHydratorManager';
import { StateMachine } from '../StateMachine';
import { AbstractHydrator } from './AbstractHydrator';

interface StateHydratorRegistry {
    hydrator: any;
    cls: Object;
    typeName: string;
}

interface FieldHydratorRegistry {
    hydrator: any;
    cls: Object;
}

const stateHydratorRegistery: StateHydratorRegistry[] = [
    {
        hydrator: hydrators.ChoiceStateHydrator,
        cls: states.Choice,
        typeName: 'Choice',
    },
    {
        hydrator: hydrators.FailStateHydrator,
        cls: states.Fail,
        typeName: 'Fail',
    },
    {
        hydrator: hydrators.ParallelStateHydrator,
        cls: states.Parallel,
        typeName: 'Parallel',
    },
    {
        hydrator: hydrators.SucceedStateHydrator,
        cls: states.Succeed,
        typeName: 'Succeed',
    },
    {
        hydrator: hydrators.TaskStateHydrator,
        cls: states.Task,
        typeName: 'Task',
    },
    {
        hydrator: hydrators.WaitStateHydrator,
        cls: states.Wait,
        typeName: 'Wait',
    },
    {
        hydrator: hydrators.PassStateHydrator,
        cls: states.Pass,
        typeName: 'Pass',
    },
]

const fieldHydratorRegistry: FieldHydratorRegistry[] = [
    {
        cls: fields.CatchField,
        hydrator: hydrators.CatchFieldHydrator
    },
    {
        cls: fields.NextField,
        hydrator: hydrators.NextFieldHydrator
    },
    {
        cls: fields.PathField,
        hydrator: hydrators.PathFieldHydrator
    },
    {
        cls: fields.ResultField,
        hydrator: hydrators.ResultFieldHydrator
    },
    {
        cls: fields.ResultPathField,
        hydrator: hydrators.ResultPathFieldHydrator
    },
    {
        cls: fields.RetryField,
        hydrator: hydrators.RetryFieldHydrator
    }
];

export class AWSStepFunctionsHydratorManager extends AbstractHydratorManager {
    extractState(state: states.State): any {
        const hydrator = this.getStateHydrator(state);
        this.emitter.emit(`before:extract:state:${state.constructor.name}`, {
            state, manager: this, hydrator
        });
        const data: any = hydrator.extract(state);
        Object.assign(data, this.extractRelatedFields(state), {
            Type: state.constructor.name,
        });
        if (state.getComment()) {
            data['Comment'] = state.getComment();
        }
        this.emitter.emit(`after:extract:state:${state.constructor.name}`, {
            state, manager: this, hydrator, data
        });
        return data;
    }
    extractField(field: fields.Field<any>): any {
        const hydrator = this.getFieldHydrator(field);
        this.emitter.emit(`before:extract:field:${field.constructor.name}`, {
            field, hydrator, manager: this
        });
        const data = hydrator.extract(field);
        this.emitter.emit(`after:extract:field:${field.constructor.name}`, {
            field, hydrator, data, manager: this
        });
        return data;
    }
    extractStateMachine(stateMachine: StateMachine): any {
        const hydrator = new hydrators.StateMachineHydrator(this);
        this.emitter.emit(`before:extract:machine`, {
            stateMachine, hydrator, manager: this
        });
        const data = hydrator.extract(stateMachine);
        this.emitter.emit(`after:extract:machine`, {
            stateMachine, hydrator, manager: this, data
        });
        return data;
    }

    extractRelatedFields(target: any) {
        let data = {};
        const relatedFields = this.getRelatedFields(target);
        return relatedFields.reduce((data, field) => {
            return Object.assign(data, this.extractField(field));
        }, data);
    }
    hydrateRelatedFields(target: any, data: any): any {
        const relatedFields = this.getRelatedFields(target, false);
        relatedFields.forEach((field) => {
            this.hydrateField(field, data);
        });
    }

    hydrateState(name: string, data: any): states.State {
        const registry = this.getStateRegistryByTypeName(data['Type']);
        const state: states.State = new (<any>registry.cls)(name);
        const hydrator: AbstractHydrator<any, this> = new (<any>registry.hydrator)(this);

        this.emitter.emit(`before:hydrate:state:${state.constructor.name}`, {
            state, registry, manager: this, hydrator
        });

        hydrator.hydrate(state, data);

        this.emitter.emit(`after:hydrate:state:${state.constructor.name}`, {
            state, registry, manager: this, hydrator
        });
        return state;
    }

    hydrateField(field: fields.Field<any>, data: any): fields.Field<any> {
        const hydrator = this.getFieldHydrator(field);
        this.emitter.emit(`before:hydrate:field:${field.constructor.name}`, {
            field, manager: this, hydrator
        });
        hydrator.hydrate(field, data);
        this.emitter.emit(`after:hydrate:field:${field.constructor.name}`, {
            field, manager: this, hydrator
        });
        return field;
    }
    hydrateStateMachine(stateMachine: StateMachine, data: any): StateMachine {
        const hydrator = new hydrators.StateMachineHydrator(this);
        this.emitter.emit(`before:hydrate:machine`, {
            stateMachine, manager: this, hydrator
        });
        hydrator.hydrate(stateMachine, data);
        this.emitter.emit(`after:hydrate:machine`, {
            stateMachine, manager: this, hydrator
        });

        return stateMachine;
    }

    getRelatedFields(target: any, configured: boolean = true): fields.Field<any>[] {
        const properies = Object.keys(target);

        return properies.filter((name: string) => {
            const property = target[name];
            if (property instanceof fields.Field && (configured === false || property.isConfigured())) {
                return true;
            } else {
                return false;
            }
        })
            .map((name) => target[name]);
    }

    private getFieldHydrator(field: fields.Field<any>): AbstractHydrator<any, any> {
        let hydrator: AbstractHydrator<fields.Field<any>, any> | null = null;

        fieldHydratorRegistry.every((registry: FieldHydratorRegistry) => {
            if (field instanceof (<any>registry.cls)) {
                hydrator = new (<any>registry.hydrator)(this);
                return false;
            } else {
                return true;
            }
        });
        if (!hydrator) {
            throw new Error(`State hydrator for ${field} not found`);
        } else {
            return hydrator;
        }
    }

    private getStateHydrator<T>(state: states.State): AbstractHydrator<T, any> {
        let hydrator: AbstractHydrator<states.State, any> | null = null;
        stateHydratorRegistery.every((registry: StateHydratorRegistry) => {
            if (state instanceof (<any>registry.cls)) {
                hydrator = new (<any>registry.hydrator)(this);
                return false;
            } else {
                return true;
            }
        });

        if (!hydrator) {
            throw new Error(`State hydrator for ${state} not found`);
        } else {
            return hydrator;
        }
    }

    private getStateRegistryByTypeName(typeName: string): StateHydratorRegistry {
        let registry: StateHydratorRegistry | null = null;
        stateHydratorRegistery.every((reg: StateHydratorRegistry) => {
            if (reg.typeName === typeName) {
                registry = reg;
                return false;
            } else {
                return true;
            }
        });

        if (!registry) {
            throw new Error(`No state-registry with type ${typeName} found`);
        } else {
            return registry;
        }
    }
}