# ui-checkbox



<!-- Auto Generated Below -->


## Overview

A labeled checkbox. Form-associated: a native light-DOM `<form>` sees `value`
(default `"on"`) while checked and nothing while unchecked, like a native checkbox.

## Properties

| Property             | Attribute  | Description                                                | Type      | Default     |
| -------------------- | ---------- | ---------------------------------------------------------- | --------- | ----------- |
| `checked`            | `checked`  |                                                            | `boolean` | `false`     |
| `disabled`           | `disabled` |                                                            | `boolean` | `false`     |
| `label` _(required)_ | `label`    |                                                            | `string`  | `undefined` |
| `name` _(required)_  | `name`     | Reflected: attribute-shaped, like a native control's name. | `string`  | `undefined` |
| `value`              | `value`    | The form value submitted while checked.                    | `string`  | `'on'`      |


## Events

| Event      | Description                                                                                 | Type                                 |
| ---------- | ------------------------------------------------------------------------------------------- | ------------------------------------ |
| `uiChange` | Fires on every toggle with `{ checked }` (composed); the inner input's `change` is stopped. | `CustomEvent<{ checked: boolean; }>` |


----------------------------------------------

*Built with [StencilJS](https://stenciljs.com/)*
