// TavernStage shared core, extracted from public/scripts/macros/definitions/variable-macros.js.
// SillyTavern ancestry and AGPL-3.0 license are retained in repository history.
// Free state and host dependencies are explicit per-session bindings.
export function createCore(__stage) {
function registerVariableMacros() {
    const ctx = (0, __stage.getVariableContext)();

    // {{setvar::name::value}} -> '' (side-effect on local variable)
    __stage.MacroRegistry.registerMacro('setvar', {
        category: __stage.MacroCategory.VARIABLE,
        unnamedArgs: [
            {
                name: 'name',
                type: __stage.MacroValueType.STRING,
                description: 'The name of the local variable to set.',
            },
            {
                name: 'value',
                type: [__stage.MacroValueType.STRING, __stage.MacroValueType.NUMBER],
                description: 'The value to set the local variable to.',
            },
        ],
        description: 'Sets a local variable to the given value.',
        returns: '',
        exampleUsage: ['{{setvar::myvar::foo}}', '{{setvar::myintvar::3}}'],
        handler: ({ unnamedArgs: [name, value] }) => {
            ctx.variables.local.set(name, value);
            return '';
        },
    });

    // {{addvar::name::value}} -> '' (side-effect via addLocalVariable)
    __stage.MacroRegistry.registerMacro('addvar', {
        category: __stage.MacroCategory.VARIABLE,
        unnamedArgs: [
            {
                name: 'name',
                type: __stage.MacroValueType.STRING,
                description: 'The name of the local variable to add to.',
            },
            {
                name: 'value',
                type: [__stage.MacroValueType.STRING, __stage.MacroValueType.NUMBER],
                description: 'The value to add to the local variable.',
            },
        ],
        description: 'Adds a value to an existing local variable (numeric or string append). If the variable does not exist, it will be created.',
        returns: '',
        exampleUsage: ['{{addvar::mystrvar::foo}}', '{{addvar::myintvar::3}}'],
        handler: ({ unnamedArgs: [name, value] }) => {
            ctx.variables.local.add(name, value);
            return '';
        },
    });

    // {{incvar::name}} -> returns new value
    __stage.MacroRegistry.registerMacro('incvar', {
        category: __stage.MacroCategory.VARIABLE,
        unnamedArgs: [
            {
                name: 'name',
                type: __stage.MacroValueType.STRING,
                description: 'The name of the local variable to increment.',
            },
        ],
        description: 'Increments a local variable by 1 and returns the new value. If the variable does not exist, it will be created.',
        returns: 'The new value of the local variable.',
        returnType: __stage.MacroValueType.NUMBER,
        exampleUsage: ['{{incvar::myintvar}}', '{{incvar some-local-int-var}}'],
        handler: ({ unnamedArgs: [name], normalize }) => {
            const result = ctx.variables.local.inc(name);
            return normalize(result);
        },
    });

    // {{decvar::name}} -> returns new value
    __stage.MacroRegistry.registerMacro('decvar', {
        category: __stage.MacroCategory.VARIABLE,
        unnamedArgs: [
            {
                name: 'name',
                type: __stage.MacroValueType.STRING,
                description: 'The name of the local variable to decrement.',
            },
        ],
        description: 'Decrements a local variable by 1 and returns the new value. If the variable does not exist, it will be created.',
        returns: 'The new value of the local variable.',
        returnType: __stage.MacroValueType.NUMBER,
        exampleUsage: ['{{decvar::myintvar}}', '{{decvar some-local-int-var}}'],
        handler: ({ unnamedArgs: [name], normalize }) => {
            const result = ctx.variables.local.dec(name);
            return normalize(result);
        },
    });

    // {{getvar::name}} -> returns current value
    __stage.MacroRegistry.registerMacro('getvar', {
        category: __stage.MacroCategory.VARIABLE,
        unnamedArgs: [
            {
                name: 'name',
                type: __stage.MacroValueType.STRING,
                description: 'The name of the local variable to get.',
            },
        ],
        description: 'Gets the value of a local variable.',
        returns: 'The value of the local variable.',
        returnType: [__stage.MacroValueType.STRING, __stage.MacroValueType.NUMBER],
        exampleUsage: ['{{getvar::myvar}}', '{{getvar myintvar}}'],
        handler: ({ unnamedArgs: [name], normalize }) => {
            const result = ctx.variables.local.get(name);
            return normalize(result);
        },
    });

    // {{hasvar::name}} -> returns 'true' or 'false'
    __stage.MacroRegistry.registerMacro('hasvar', {
        aliases: [{ alias: 'varexists' }],
        category: __stage.MacroCategory.VARIABLE,
        unnamedArgs: [
            {
                name: 'name',
                type: __stage.MacroValueType.STRING,
                description: 'The name of the local variable to check.',
            },
        ],
        description: 'Checks if a local variable exists.',
        returns: '"true" if the variable exists, "false" otherwise.',
        returnType: __stage.MacroValueType.STRING,
        exampleUsage: ['{{hasvar::myvar}}', '{{hasvar some-local-var}}'],
        handler: ({ unnamedArgs: [name] }) => {
            return ctx.variables.local.has(name) ? 'true' : 'false';
        },
    });

    // {{deletevar::name}} -> returns ''
    __stage.MacroRegistry.registerMacro('deletevar', {
        aliases: [{ alias: 'flushvar' }],
        category: __stage.MacroCategory.VARIABLE,
        unnamedArgs: [
            {
                name: 'name',
                type: __stage.MacroValueType.STRING,
                description: 'The name of the local variable to delete.',
            },
        ],
        description: 'Deletes a local variable.',
        returns: '',
        exampleUsage: ['{{deletevar::myvar}}', '{{deletevar some-local-var}}'],
        handler: ({ unnamedArgs: [name] }) => {
            ctx.variables.local.del(name);
            return '';
        },
    });

    // {{setglobalvar::name::value}} -> ''
    __stage.MacroRegistry.registerMacro('setglobalvar', {
        category: __stage.MacroCategory.VARIABLE,
        unnamedArgs: [
            {
                name: 'name',
                type: __stage.MacroValueType.STRING,
                description: 'The name of the global variable to set.',
            },
            {
                name: 'value',
                type: [__stage.MacroValueType.STRING, __stage.MacroValueType.NUMBER],
                description: 'The value to set the global variable to.',
            },
        ],
        description: 'Sets a global variable to the given value.',
        returns: '',
        exampleUsage: ['{{setglobalvar::myvar::foo}}', '{{setglobalvar::myintvar::3}}'],
        handler: ({ unnamedArgs: [name, value] }) => {
            ctx.variables.global.set(name, value);
            return '';
        },
    });

    // {{addglobalvar::name::value}} -> ''
    __stage.MacroRegistry.registerMacro('addglobalvar', {
        category: __stage.MacroCategory.VARIABLE,
        unnamedArgs: [
            {
                name: 'name',
                type: __stage.MacroValueType.STRING,
                description: 'The name of the global variable to add to.',
            },
            {
                name: 'value',
                type: [__stage.MacroValueType.STRING, __stage.MacroValueType.NUMBER],
                description: 'The value to add to the global variable.',
            },
        ],
        description: 'Adds a value to an existing global variable (numeric or string append). If the variable does not exist, it will be created.',
        returns: '',
        exampleUsage: ['{{addglobalvar::mystrvar::foo}}', '{{addglobalvar::myintvar::3}}'],
        handler: ({ unnamedArgs: [name, value] }) => {
            ctx.variables.global.add(name, value);
            return '';
        },
    });

    // {{incglobalvar::name}} -> returns new value
    __stage.MacroRegistry.registerMacro('incglobalvar', {
        category: __stage.MacroCategory.VARIABLE,
        unnamedArgs: [
            {
                name: 'name',
                type: __stage.MacroValueType.STRING,
                description: 'The name of the global variable to increment.',
            },
        ],
        description: 'Increments a global variable by 1 and returns the new value. If the variable does not exist, it will be created.',
        returns: 'The new value of the global variable.',
        returnType: __stage.MacroValueType.NUMBER,
        exampleUsage: ['{{incglobalvar::myintvar}}', '{{incglobalvar some-global-int-var}}'],
        handler: ({ unnamedArgs: [name], normalize }) => {
            const result = ctx.variables.global.inc(name);
            return normalize(result);
        },
    });

    // {{decglobalvar::name}} -> returns new value
    __stage.MacroRegistry.registerMacro('decglobalvar', {
        category: __stage.MacroCategory.VARIABLE,
        unnamedArgs: [
            {
                name: 'name',
                type: __stage.MacroValueType.STRING,
                description: 'The name of the global variable to decrement.',
            },
        ],
        description: 'Decrements a global variable by 1 and returns the new value. If the variable does not exist, it will be created.',
        returns: 'The new value of the global variable.',
        returnType: __stage.MacroValueType.NUMBER,
        exampleUsage: ['{{decglobalvar::myintvar}}', '{{decglobalvar some-global-int-var}}'],
        handler: ({ unnamedArgs: [name], normalize }) => {
            const result = ctx.variables.global.dec(name);
            return normalize(result);
        },
    });

    // {{getglobalvar::name}} -> returns current value
    __stage.MacroRegistry.registerMacro('getglobalvar', {
        category: __stage.MacroCategory.VARIABLE,
        unnamedArgs: [
            {
                name: 'name',
                type: __stage.MacroValueType.STRING,
                description: 'The name of the global variable to get.',
            },
        ],
        description: 'Gets the value of a global variable.',
        returns: 'The value of the global variable.',
        returnType: [__stage.MacroValueType.STRING, __stage.MacroValueType.NUMBER],
        exampleUsage: ['{{getglobalvar::myvar}}', '{{getglobalvar myintvar}}'],
        handler: ({ unnamedArgs: [name], normalize }) => {
            const result = ctx.variables.global.get(name);
            return normalize(result);
        },
    });

    // {{hasglobalvar::name}} -> returns 'true' or 'false'
    __stage.MacroRegistry.registerMacro('hasglobalvar', {
        aliases: [{ alias: 'globalvarexists' }],
        category: __stage.MacroCategory.VARIABLE,
        unnamedArgs: [
            {
                name: 'name',
                type: __stage.MacroValueType.STRING,
                description: 'The name of the global variable to check.',
            },
        ],
        description: 'Checks if a global variable exists.',
        returns: '"true" if the variable exists, "false" otherwise.',
        returnType: __stage.MacroValueType.STRING,
        exampleUsage: ['{{hasglobalvar::myvar}}', '{{hasglobalvar some-global-var}}'],
        handler: ({ unnamedArgs: [name] }) => {
            return ctx.variables.global.has(name) ? 'true' : 'false';
        },
    });

    // {{deleteglobalvar::name}} -> returns ''
    __stage.MacroRegistry.registerMacro('deleteglobalvar', {
        aliases: [{ alias: 'flushglobalvar' }],
        category: __stage.MacroCategory.VARIABLE,
        unnamedArgs: [
            {
                name: 'name',
                type: __stage.MacroValueType.STRING,
                description: 'The name of the global variable to delete.',
            },
        ],
        description: 'Deletes a global variable.',
        returns: '',
        exampleUsage: ['{{deleteglobalvar::myvar}}', '{{deleteglobalvar some-global-var}}'],
        handler: ({ unnamedArgs: [name] }) => {
            ctx.variables.global.del(name);
            return '';
        },
    });
}
return { registerVariableMacros };
}
