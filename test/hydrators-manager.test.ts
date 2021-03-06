import { expect } from 'chai';
import { AWSStepFunctionsHydratorManager } from '../src/hydrators';
import { Wait, Task, NextField, StateMachine } from '../src';

const awsParallelExampleFixture = require('./fixtures/aws-parallel-example.json');

describe('Hydrator Manager', () => {
    let manager: AWSStepFunctionsHydratorManager;
    let stateMachine: StateMachine;
    let fooState: Task;
    beforeEach(() => {
        manager = new AWSStepFunctionsHydratorManager({
            emitter: {
                delimiter: ':',
                wildcard: true
            }
        });
        stateMachine = new StateMachine();
        fooState = new Task('foo');
    });

    it('should extract state Wait', () => {
        const wait = new Wait('foo');
        wait.setSeconds(1);
        const data = manager.extractState(wait);
        expect(data).to.deep.equal({
            Type: 'Wait',
            Seconds: 1
        });
    });

    it('should extract state Task', () => {
        const state = new Task('foo');
        state.setResource('xy').next.end();
        const data = manager.extractState(state);
        expect(data).to.deep.equal({
            Type: 'Task',
            Resource: 'xy',
            End: true
        });
    });

    it('should extract field Next', () => {
        const field = new NextField(fooState);
        field.end();
        const data = manager.extractField(field);
        expect(data).to.deep.equal({
            End: true
        });
    });

    it('should extract stateMachine', () => {
        stateMachine.states.add(fooState.setResource('xy')).link();
        const data = manager.extractStateMachine(stateMachine);
        expect(data).to.deep.equal({
            StartAt: 'foo',
            States: {
                foo: {
                    Type: 'Task',
                    Resource: 'xy',
                    End: true
                }
            }
        });
    });

    it('should hydrate and extract aws parallel example without changes', () => {
        manager.hydrateStateMachine(stateMachine, awsParallelExampleFixture);

        const data = manager.extractStateMachine(stateMachine);
        expect(data).to.deep.equal(awsParallelExampleFixture);
    });

    describe('EventEmitter', () => {
        it('should emit the state extract event', () => {
            let eventArgument = null;
            manager.emitter.on('before:extract:state:*', (event) => {
                eventArgument = event;
            });
            const wait = new Wait('foo');
            wait.setSeconds(1);
            const data = manager.extractState(wait);
            expect(eventArgument).to.haveOwnProperty('state');
            expect(eventArgument).to.haveOwnProperty('manager');
            expect(eventArgument).to.haveOwnProperty('hydrator');
        });
    });
});