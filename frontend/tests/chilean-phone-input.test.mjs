import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';

const { ChileanPhoneInput } = createRequire(import.meta.url)('./helpers/chilean-phone-input.cjs');

test('prefijo fijo, número nacional editable y formato completo para la API', async () => {
  let tree, saved;
  function View() {
    const [value, setValue] = React.useState('+56912345678');
    saved = value;
    return React.createElement(ChileanPhoneInput, { value, required: true, onChange: setValue });
  }
  await act(async () => { tree = create(React.createElement(View)); });
  try {
    const input = () => tree.root.findByType('input');
    assert.equal(input().props.value, '912345678');
    assert.equal(input().props.pattern, '9[0-9]{8}');
    assert.equal(input().props.required, true);
    for (const value of ['987654321', '+56 9 8765-4321', '56987654321']) {
      await act(async () => input().props.onChange({ target: { value } }));
      assert.equal(input().props.value, '987654321');
      assert.equal(saved, '+56987654321');
    }
    await act(async () => input().props.onChange({ target: { value: '' } }));
    assert.equal(saved, '');
    assert.equal(tree.root.findByProps({ className: 'chilean-phone-prefix' }).children.join(''), '+56');
  } finally { act(() => tree.unmount()); }
});

test('cliente permite conservar teléfono fijo chileno y hereda el bloqueo durante el guardado', async () => {
  let tree;
  await act(async () => { tree = create(React.createElement(ChileanPhoneInput, {
    value: '+56223456789', pattern: '[2-9][0-9]{8}', disabled: true, onChange() {},
  })); });
  try {
    const input = tree.root.findByType('input');
    assert.equal(input.props.value, '223456789');
    assert.equal(input.props.disabled, true);
    assert.match(input.props.value, new RegExp('^' + input.props.pattern + '$'));
  } finally { act(() => tree.unmount()); }
});
