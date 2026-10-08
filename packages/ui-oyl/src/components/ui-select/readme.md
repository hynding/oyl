# ui-select



<!-- Auto Generated Below -->


## Overview

Label + native `<select>` + hint/error, the same anatomy and aria wiring as `ui-field`.
Form-associated. When `options` change under the current `value`, the value is synced to
the first option (or `''`) WITHOUT emitting `uiChange` — a sync, not a user choice.

## Properties

| Property             | Attribute  | Description                                                    | Type                      | Default     |
| -------------------- | ---------- | -------------------------------------------------------------- | ------------------------- | ----------- |
| `disabled`           | `disabled` |                                                                | `boolean`                 | `false`     |
| `error`              | `error`    | Validation message; sets `aria-invalid` and replaces the hint. | `string \| undefined`     | `undefined` |
| `hint`               | `hint`     | Supporting copy under the select; hidden while `error` is set. | `string \| undefined`     | `undefined` |
| `label` _(required)_ | `label`    |                                                                | `string`                  | `undefined` |
| `name` _(required)_  | `name`     | Reflected: attribute-shaped, like a native control's name.     | `string`                  | `undefined` |
| `options`            | --         |                                                                | `readonly SelectOption[]` | `[]`        |
| `value`              | `value`    |                                                                | `string`                  | `''`        |


## Events

| Event      | Description                                                                                      | Type                              |
| ---------- | ------------------------------------------------------------------------------------------------ | --------------------------------- |
| `uiChange` | Fires when the user picks an option, with `{ value }` (composed); the inner `change` is stopped. | `CustomEvent<{ value: string; }>` |


----------------------------------------------

*Built with [StencilJS](https://stenciljs.com/)*
