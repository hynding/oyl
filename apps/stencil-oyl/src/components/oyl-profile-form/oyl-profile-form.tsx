import { Component, Element, Event, Prop, State, Watch, h, type EventEmitter } from '@stencil/core'
import type { ProfilePatch } from '@oyl/all-of-oyl/client'
import { GENDER_OPTIONS, OTHER, UNIT_OPTIONS, readPatch, seedFrom, timezoneOptions, type FormSeed, type Units } from '../../profile/format.js'

function systemZones(): readonly string[] | null {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
  return typeof intl.supportedValuesOf === 'function' ? intl.supportedValuesOf('timeZone') : null
}

/**
 * The editable profile: timezone (IANA select, or a text field when the platform has no zone
 * list), units, birthday, location, weight/height in the chosen units, gender with an "Other"
 * self-describe field. Text fields render `value={seed.x}` from a seed recomputed only when
 * `value` changes, so a parent re-render never re-applies a value over the user's typing; the
 * selects are owned as state (the `ui-select` rule). Submit emits vanilla's patch.
 */
@Component({ tag: 'oyl-profile-form', styleUrl: 'oyl-profile-form.css', shadow: true })
export class OylProfileForm {
  @Element() host!: HTMLElement

  /** The current profile's editable slice (`toPatch(user)`), `{}` for none. */
  @Prop() value: ProfilePatch = {}
  /** IANA zones for the timezone select; `null` → text field. Defaults to the platform list. */
  @Prop() zones: readonly string[] | null = systemZones()

  /** The user submitted; detail = the patch to save. */
  @Event() save!: EventEmitter<ProfilePatch>

  @State() seed: FormSeed = seedFrom({})
  @State() timezone = ''
  @State() units: Units = 'metric'
  @State() gender = ''

  componentWillLoad() {
    this.reseed()
  }

  @Watch('value')
  reseed() {
    this.seed = seedFrom(this.value)
    this.timezone = this.seed.timezone
    this.units = this.seed.units
    this.gender = this.seed.gender
  }

  private field(name: string): (HTMLElement & { value: string }) | null {
    return this.host.shadowRoot?.querySelector(`ui-field[name="${name}"]`) as (HTMLElement & { value: string }) | null
  }

  private onTimezone = (e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.timezone = e.detail.value }
  private onUnits = (e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.units = e.detail.value as Units }
  private onGender = (e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.gender = e.detail.value }

  private onSubmit = (ev: Event) => {
    ev.preventDefault()
    const read = (name: string) => this.field(name)?.value ?? ''
    this.save.emit(readPatch({
      timezone: this.zones ? this.timezone : read('timezone'),
      units: this.units,
      birthday: read('birthday'),
      weight: read('weight'),
      height: read('height'),
      gender: this.gender,
      genderOther: this.gender === OTHER ? read('genderOther') : '',
      location: read('location'),
    }))
  }

  render() {
    const s = this.seed
    const imperial = this.units === 'imperial'
    const tzOptions = timezoneOptions(this.zones, s.timezone)
    return (
      <form onSubmit={this.onSubmit}>
        <div class="grid">
          {tzOptions ? (
            <ui-select name="timezone" label="Timezone" options={tzOptions} value={this.timezone} onUiChange={this.onTimezone} />
          ) : (
            <ui-field name="timezone" label="Timezone (IANA)" type="text" value={s.timezone} />
          )}
          <ui-select name="units" label="Units" options={[...UNIT_OPTIONS]} value={this.units} onUiChange={this.onUnits} />
          <ui-field name="birthday" label="Birthday" type="date" value={s.birthday} />
          <ui-field name="location" label="Location" type="text" value={s.location} />
          <ui-field name="weight" label="Weight" type="number" hint={imperial ? 'lb' : 'kg'} value={s.weight} />
          <ui-field name="height" label="Height" type="number" hint={imperial ? 'in' : 'cm'} value={s.height} />
          <ui-select name="gender" label="Gender" options={[...GENDER_OPTIONS]} value={this.gender} onUiChange={this.onGender} />
          {this.gender === OTHER ? <ui-field name="genderOther" label="Self-describe" type="text" value={s.genderOther} /> : null}
        </div>
        <div class="actions">
          <ui-button type="submit" variant="primary">Save profile</ui-button>
        </div>
      </form>
    )
  }
}
