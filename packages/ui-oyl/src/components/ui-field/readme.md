# ui-field



<!-- Auto Generated Below -->


## Overview

Label + input + hint/error in one shadow root, with the aria wiring done. Form-associated,
so a native light-DOM `<form>` sees its value (`FormData`, submit).

## Properties

| Property             | Attribute      | Description                                                          | Type                                                                        | Default     |
| -------------------- | -------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------- |
| `autocomplete`       | `autocomplete` |                                                                      | `string \| undefined`                                                       | `undefined` |
| `error`              | `error`        | Validation message; sets `aria-invalid` and replaces the hint.       | `string \| undefined`                                                       | `undefined` |
| `hint`               | `hint`         | Supporting copy under the input; hidden while `error` is set.        | `string \| undefined`                                                       | `undefined` |
| `label` _(required)_ | `label`        |                                                                      | `string`                                                                    | `undefined` |
| `name` _(required)_  | `name`         | Reflected: a field's name is attribute-shaped (selectors, autofill). | `string`                                                                    | `undefined` |
| `required`           | `required`     |                                                                      | `boolean`                                                                   | `false`     |
| `type`               | `type`         |                                                                      | `"date" \| "datetime-local" \| "email" \| "number" \| "password" \| "text"` | `'text'`    |
| `value`              | `value`        |                                                                      | `string`                                                                    | `''`        |


## Events

| Event      | Description                                                                                                                                                                               | Type                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `uiChange` | Fires when the input commits (blur/enter) with `{ value }`.                                                                                                                               | `CustomEvent<{ value: string; }>` |
| `uiInput`  | Fires on every keystroke with `{ value }` (composed). The inner input's native `input`/`change` events are stopped at the shadow boundary, so this is the only value event consumers see. | `CustomEvent<{ value: string; }>` |


----------------------------------------------

*Built with [StencilJS](https://stenciljs.com/)*
