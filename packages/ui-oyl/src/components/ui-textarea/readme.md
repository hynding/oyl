# ui-textarea



<!-- Auto Generated Below -->


## Overview

Multiline sibling of ui-field: label + textarea + hint/error with the aria wiring done,
form-associated, auto-growing. ⌘/Ctrl+Enter emits `uiSubmit` so a host form can submit.

## Properties

| Property             | Attribute     | Description                                                             | Type                  | Default     |
| -------------------- | ------------- | ----------------------------------------------------------------------- | --------------------- | ----------- |
| `autogrow`           | `autogrow`    |                                                                         | `boolean`             | `true`      |
| `error`              | `error`       |                                                                         | `string \| undefined` | `undefined` |
| `hint`               | `hint`        |                                                                         | `string \| undefined` | `undefined` |
| `label` _(required)_ | `label`       |                                                                         | `string`              | `undefined` |
| `name` _(required)_  | `name`        |                                                                         | `string`              | `undefined` |
| `placeholder`        | `placeholder` |                                                                         | `string \| undefined` | `undefined` |
| `required`           | `required`    |                                                                         | `boolean`             | `false`     |
| `rows`               | `rows`        | Minimum visible rows; the box grows with content when `autogrow` is on. | `number`              | `2`         |
| `value`              | `value`       |                                                                         | `string`              | `''`        |


## Events

| Event      | Description                                                                                          | Type                              |
| ---------- | ---------------------------------------------------------------------------------------------------- | --------------------------------- |
| `uiChange` |                                                                                                      | `CustomEvent<{ value: string; }>` |
| `uiInput`  | Every keystroke, `{ value }` (composed). The native input/change events stop at the shadow boundary. | `CustomEvent<{ value: string; }>` |
| `uiSubmit` | ⌘/Ctrl+Enter inside the textarea — the host form's submit shortcut.                                  | `CustomEvent<void>`               |


----------------------------------------------

*Built with [StencilJS](https://stenciljs.com/)*
