# ui-segment



<!-- Auto Generated Below -->


## Overview

A segmented control: a small set of mutually exclusive choices as a radiogroup with
roving tabindex and arrow-key selection. Options render as native buttons carrying
`data-value` (the e2e selector).

## Properties

| Property             | Attribute | Description                   | Type                  | Default     |
| -------------------- | --------- | ----------------------------- | --------------------- | ----------- |
| `label` _(required)_ | `label`   | Accessible name of the group. | `string`              | `undefined` |
| `name`               | `name`    |                               | `string \| undefined` | `undefined` |
| `options`            | --        |                               | `SegmentOption[]`     | `[]`        |
| `value`              | `value`   |                               | `string`              | `''`        |


## Events

| Event      | Description | Type                              |
| ---------- | ----------- | --------------------------------- |
| `uiChange` |             | `CustomEvent<{ value: string; }>` |


----------------------------------------------

*Built with [StencilJS](https://stenciljs.com/)*
