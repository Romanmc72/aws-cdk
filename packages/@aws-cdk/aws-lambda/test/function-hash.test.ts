import * as path from 'path';
import { resourceSpecification } from '@aws-cdk/cfnspec';
import { App, CfnOutput, CfnResource, Stack } from '@aws-cdk/core';
import { LAMBDA_RECOGNIZE_LAYER_VERSION, LAMBDA_RECOGNIZE_VERSION_PROPS } from '@aws-cdk/cx-api';
import * as lambda from '../lib';
import { calculateFunctionHash, trimFromStart, VERSION_LOCKED } from '../lib/function-hash';

describe('function hash', () => {
  describe('trimFromStart', () => {

    test('trim not needed', () => {
      expect(trimFromStart('foo', 100)).toEqual('foo');
      expect(trimFromStart('foo', 3)).toEqual('foo');
      expect(trimFromStart('', 3)).toEqual('');
    });

    test('trim required', () => {
      expect(trimFromStart('hello', 3)).toEqual('llo');
      expect(trimFromStart('hello', 4)).toEqual('ello');
      expect(trimFromStart('hello', 1)).toEqual('o');
    });
  });

  describe('calcHash', () => {
    test('same configuration and code yields the same hash', () => {
      const stack1 = new Stack();
      const fn1 = new lambda.Function(stack1, 'MyFunction1', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromAsset(path.join(__dirname, 'handler.zip')),
        handler: 'index.handler',
      });

      const stack2 = new Stack();
      const fn2 = new lambda.Function(stack2, 'MyFunction1', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromAsset(path.join(__dirname, 'handler.zip')),
        handler: 'index.handler',
      });

      expect(calculateFunctionHash(fn1)).toEqual(calculateFunctionHash(fn2));
      expect(calculateFunctionHash(fn1)).toEqual('aea5463dba236007afe91d2832b3c836');
    });
  });

  test('code impacts hash', () => {
    const stack1 = new Stack();
    const fn1 = new lambda.Function(stack1, 'MyFunction1', {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(path.join(__dirname, 'my-lambda-handler')),
      handler: 'index.handler',
    });

    expect(calculateFunctionHash(fn1)).not.toEqual('aea5463dba236007afe91d2832b3c836');
    expect(calculateFunctionHash(fn1)).toEqual('979b4a14c6f174c745cdbcd1036cf844');
  });

  test('environment variables impact hash', () => {
    const stack1 = new Stack();
    const fn1 = new lambda.Function(stack1, 'MyFunction', {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(path.join(__dirname, 'my-lambda-handler')),
      handler: 'index.handler',
      environment: {
        Foo: 'bar',
      },
    });

    const stack2 = new Stack();
    const fn2 = new lambda.Function(stack2, 'MyFunction', {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(path.join(__dirname, 'my-lambda-handler')),
      handler: 'index.handler',
      environment: {
        Foo: 'beer',
      },
    });

    expect(calculateFunctionHash(fn1)).toEqual('d1bc824ac5022b7d62d8b12dbae6580c');
    expect(calculateFunctionHash(fn2)).toEqual('3b683d05465012b0aa9c4ff53b32f014');
  });

  test('runtime impacts hash', () => {
    const stack1 = new Stack();
    const fn1 = new lambda.Function(stack1, 'MyFunction', {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(path.join(__dirname, 'my-lambda-handler')),
      handler: 'index.handler',
      environment: {
        Foo: 'bar',
      },
    });

    const stack2 = new Stack();
    const fn2 = new lambda.Function(stack2, 'MyFunction', {
      runtime: lambda.Runtime.NODEJS_10_X,
      code: lambda.Code.fromAsset(path.join(__dirname, 'my-lambda-handler')),
      handler: 'index.handler',
      environment: {
        Foo: 'beer',
      },
    });

    expect(calculateFunctionHash(fn1)).toEqual('d1bc824ac5022b7d62d8b12dbae6580c');
    expect(calculateFunctionHash(fn2)).toEqual('0f168f0772463e8e547bb3800937e54d');
  });

  test('inline code change impacts the hash', () => {
    const stack1 = new Stack();
    const fn1 = new lambda.Function(stack1, 'MyFunction', {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromInline('foo'),
      handler: 'index.handler',
    });

    const stack2 = new Stack();
    const fn2 = new lambda.Function(stack2, 'MyFunction', {
      runtime: lambda.Runtime.NODEJS_10_X,
      code: lambda.Code.fromInline('foo bar'),
      handler: 'index.handler',
    });

    expect(calculateFunctionHash(fn1)).toEqual('ebf2e871fc6a3062e8bdcc5ebe16db3f');
    expect(calculateFunctionHash(fn2)).toEqual('ffedf6424a18a594a513129dc97bf53c');
  });

  describe('lambda layers', () => {
    let stack1: Stack;
    let layer1: lambda.LayerVersion;
    let layer2: lambda.LayerVersion;
    beforeAll(() => {
      stack1 = new Stack();
      layer1 = new lambda.LayerVersion(stack1, 'MyLayer', {
        code: lambda.Code.fromAsset(path.join(__dirname, 'layer-code')),
        compatibleRuntimes: [lambda.Runtime.NODEJS_12_X],
        license: 'Apache-2.0',
        description: 'A layer to test the L2 construct',
      });
      layer2 = new lambda.LayerVersion(stack1, 'MyLayer2', {
        code: lambda.Code.fromAsset(path.join(__dirname, 'layer-code')),
        compatibleRuntimes: [lambda.Runtime.NODEJS_12_X],
        license: 'Apache-2.0',
        description: 'A layer to test the L2 construct',
      });
    });

    test('same configuration yields the same hash', () => {
      const stack2 = new Stack();
      const fn1 = new lambda.Function(stack2, 'MyFunction', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromInline('foo'),
        handler: 'index.handler',
        layers: [layer1],
      });

      const stack3 = new Stack();
      const fn2 = new lambda.Function(stack3, 'MyFunction', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromInline('foo'),
        handler: 'index.handler',
        layers: [layer1],
      });

      expect(calculateFunctionHash(fn1)).toEqual(calculateFunctionHash(fn2));
      expect(calculateFunctionHash(fn1)).toEqual('028f8a4cb1c719f29e70b7b3c0f2a9d7');
    });

    test('different layers impacts hash', () => {
      const stack2 = new Stack();
      const fn1 = new lambda.Function(stack2, 'MyFunction', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromInline('foo'),
        handler: 'index.handler',
        layers: [layer1],
      });

      const stack3 = new Stack();
      const fn2 = new lambda.Function(stack3, 'MyFunction', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromInline('foo'),
        handler: 'index.handler',
        layers: [layer2],
      });

      expect(calculateFunctionHash(fn1)).toEqual('028f8a4cb1c719f29e70b7b3c0f2a9d7');
      expect(calculateFunctionHash(fn2)).toEqual('e74647bf81c4d532137545c8234726f3');
    });

    describe('impact of lambda layer order on hash', () => {
      test('without feature flag, preserve old behavior to avoid unnecessary invalidation of templates', () => {
        const stack2 = new Stack();
        const fn1 = new lambda.Function(stack2, 'MyFunction', {
          runtime: lambda.Runtime.NODEJS_12_X,
          code: lambda.Code.fromInline('foo'),
          handler: 'index.handler',
          layers: [layer1, layer2],
        });

        const stack3 = new Stack();
        const fn2 = new lambda.Function(stack3, 'MyFunction', {
          runtime: lambda.Runtime.NODEJS_12_X,
          code: lambda.Code.fromInline('foo'),
          handler: 'index.handler',
          layers: [layer2, layer1],
        });

        expect(calculateFunctionHash(fn1)).toEqual('b6cade45d8f9c77f29f0ab169004113c');
        expect(calculateFunctionHash(fn2)).toEqual('0d79a0b6bcac599b278e63b173eca170');
      });

      test('with feature flag, we sort layers so order is consistent', () => {
        const app = new App({ context: { [LAMBDA_RECOGNIZE_LAYER_VERSION]: true } });

        const stack2 = new Stack(app, 'stack2');
        const fn1 = new lambda.Function(stack2, 'MyFunction', {
          runtime: lambda.Runtime.NODEJS_12_X,
          code: lambda.Code.fromInline('foo'),
          handler: 'index.handler',
          layers: [layer1, layer2],
        });

        const stack3 = new Stack(app, 'stack3');
        const fn2 = new lambda.Function(stack3, 'MyFunction', {
          runtime: lambda.Runtime.NODEJS_12_X,
          code: lambda.Code.fromInline('foo'),
          handler: 'index.handler',
          layers: [layer2, layer1],
        });

        expect(calculateFunctionHash(fn1)).toEqual(calculateFunctionHash(fn2));
      });
    });

    test('with feature flag, imported lambda layers can be distinguished', () => {
      const app = new App({ context: { [LAMBDA_RECOGNIZE_LAYER_VERSION]: true } });

      const stack2 = new Stack(app, 'stack2');
      const importedLayer1 = lambda.LayerVersion.fromLayerVersionArn(stack2, 'imported-layer', 'arn:aws:lambda:<region>:<account>:layer:<layer-name>:<version1>');
      const fn1 = new lambda.Function(stack2, 'MyFunction', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromInline('foo'),
        handler: 'index.handler',
        layers: [importedLayer1],
      });

      const stack3 = new Stack(app, 'stack3');
      const importedLayer2 = lambda.LayerVersion.fromLayerVersionArn(stack3, 'imported-layer', 'arn:aws:lambda:<region>:<account>:layer:<layer-name>:<version2>');
      const fn2 = new lambda.Function(stack3, 'MyFunction', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromInline('foo'),
        handler: 'index.handler',
        layers: [importedLayer2],
      });

      expect(calculateFunctionHash(fn1)).not.toEqual(calculateFunctionHash(fn2));
    });
  });

  describe('impact of env variables order on hash', () => {
    test('without "currentVersion", we preserve old behavior to avoid unnecessary invalidation of templates', () => {
      const stack1 = new Stack();
      const fn1 = new lambda.Function(stack1, 'MyFunction', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromAsset(path.join(__dirname, 'my-lambda-handler')),
        handler: 'index.handler',
        environment: {
          Foo: 'bar',
          Bar: 'foo',
        },
      });

      const stack2 = new Stack();
      const fn2 = new lambda.Function(stack2, 'MyFunction', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromAsset(path.join(__dirname, 'my-lambda-handler')),
        handler: 'index.handler',
        environment: {
          Bar: 'foo',
          Foo: 'bar',
        },
      });

      expect(calculateFunctionHash(fn1)).not.toEqual(calculateFunctionHash(fn2));
    });

    test('with "currentVersion", we sort env keys so order is consistent', () => {
      const stack1 = new Stack();
      const fn1 = new lambda.Function(stack1, 'MyFunction', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromAsset(path.join(__dirname, 'my-lambda-handler')),
        handler: 'index.handler',
        environment: {
          Foo: 'bar',
          Bar: 'foo',
        },
      });

      new CfnOutput(stack1, 'VersionArn', { value: fn1.currentVersion.functionArn });

      const stack2 = new Stack();
      const fn2 = new lambda.Function(stack2, 'MyFunction', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromAsset(path.join(__dirname, 'my-lambda-handler')),
        handler: 'index.handler',
        environment: {
          Bar: 'foo',
          Foo: 'bar',
        },
      });

      new CfnOutput(stack2, 'VersionArn', { value: fn2.currentVersion.functionArn });

      expect(calculateFunctionHash(fn1)).toEqual(calculateFunctionHash(fn2));
    });
  });

  describe('corrected function hash', () => {
    let app: App;
    beforeEach(() => {
      app = new App({ context: { [LAMBDA_RECOGNIZE_VERSION_PROPS]: true } });
    });

    test('DependsOn does not impact function hash', () => {
      const stack1 = new Stack(app, 'Stack1');
      const fn1 = new lambda.Function(stack1, 'MyFunction1', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromAsset(path.join(__dirname, 'handler.zip')),
        handler: 'index.handler',
      });

      const stack2 = new Stack(app, 'Stack2');
      const fn2 = new lambda.Function(stack2, 'MyFunction1', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromAsset(path.join(__dirname, 'handler.zip')),
        handler: 'index.handler',
      });
      const res = new CfnResource(stack2, 'MyResource', {
        type: 'AWS::Foo::Bar',
        properties: {
          Name: 'Value',
        },
      });
      fn2.node.addDependency(res);

      expect(calculateFunctionHash(fn1)).toEqual('e5235e3cb7a9b70c42c1a665a3ebd77c');
      expect(calculateFunctionHash(fn1)).toEqual(calculateFunctionHash(fn2));
    });

    test('properties not locked to the version do not impact function hash', () => {
      const stack1 = new Stack(app, 'Stack1');
      const fn1 = new lambda.Function(stack1, 'MyFunction', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromAsset(path.join(__dirname, 'handler.zip')),
        handler: 'index.handler',
      });

      const stack2 = new Stack(app, 'Stack2');
      const fn2 = new lambda.Function(stack2, 'MyFunction', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromAsset(path.join(__dirname, 'handler.zip')),
        handler: 'index.handler',

        reservedConcurrentExecutions: 5, // property not locked to the version
      });

      // expect(calculateFunctionHash(fn1)).toEqual('b0d8729d597bdde2d79312fbf619c974');
      expect(calculateFunctionHash(fn1)).toEqual(calculateFunctionHash(fn2));
    });

    test('unclassified property throws an error', () => {
      const stack = new Stack(app);
      const fn1 = new lambda.Function(stack, 'MyFunction1', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromAsset(path.join(__dirname, 'handler.zip')),
        handler: 'index.handler',
      });
      (fn1.node.defaultChild as CfnResource).addPropertyOverride('UnclassifiedProp', 'Value');

      expect(() => calculateFunctionHash(fn1)).toThrow(/properties are not recognized/);
    });

    test('manual classification as version locked', () => {
      const stack = new Stack(app);
      const fn1 = new lambda.Function(stack, 'MyFunction1', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromAsset(path.join(__dirname, 'handler.zip')),
        handler: 'index.handler',
      });

      const original = calculateFunctionHash(fn1);
      lambda.Function.classifyVersionProperty('UnclassifiedProp', true);
      (fn1.node.defaultChild as CfnResource).addPropertyOverride('UnclassifiedProp', 'Value');
      expect(calculateFunctionHash(fn1)).not.toEqual(original);
    });

    test('manual classification as not version locked', () => {
      const stack = new Stack(app);
      const fn1 = new lambda.Function(stack, 'MyFunction1', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromAsset(path.join(__dirname, 'handler.zip')),
        handler: 'index.handler',
      });

      const original = calculateFunctionHash(fn1);
      lambda.Function.classifyVersionProperty('UnclassifiedProp', false);
      (fn1.node.defaultChild as CfnResource).addPropertyOverride('UnclassifiedProp', 'Value');
      expect(calculateFunctionHash(fn1)).toEqual(original);
    });

    test('all CFN properties are classified', () => {
      const spec = resourceSpecification('AWS::Lambda::Function');
      expect(spec.Properties).toBeDefined();
      const expected = Object.keys(spec.Properties!).sort();
      const actual = Object.keys(VERSION_LOCKED).sort();
      expect(actual).toEqual(expected);
    });
  });
});
