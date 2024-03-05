'use strict';

const Device = require('../../lib/Device');
const { filled, blank } = require('../../lib/Utils');

class KeypadDevice extends Device {

  /*
  | Device events
  */

  // Settings changed
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('[Settings] Updating');

    const settings = {};

    // Check availability
    if (!this.getAvailable()) {
      throw new Error(this.homey.__('state.notAvailable'));
    }

    for (const name of changedKeys) {
      const newValue = newSettings[name];

      this.log(`[Settings] '${name}' is now '${newValue}'`);

      // Sound level
      if (name === 'sound_level') {
        settings.soundLevel = Number(newValue);
      }

      // Backlight level
      if (name === 'backlight_level') {
        settings.backlightLevel = Number(newValue);
      }

      // Bell button enabled
      if (name === 'bell_button_enabled') {
        settings.bellButtonEnabled = newValue;
      }
    }

    // Device settings need to be updated
    if (filled(settings)) {
      this.log('[Settings] Updating device');

      await this.oAuth2Client.updateSettings('keypad', this.tid, settings);
    }

    this.log('[Settings] Updated');
  }

  /*
  | Support functions
  */

  // Returns settings from given data
  getSettingsData(data) {
    const settings = {};

    if (blank(data.deviceSettings)) {
      return settings;
    }

    // Set device settings
    const device = data.deviceSettings;

    if ('soundLevel' in device) {
      settings.sound_level = `${device.soundLevel}`;
    }

    if ('backlightLevel' in device) {
      settings.backlight_level = `${device.backlightLevel}`;
    }

    if ('bellButtonEnabled' in device) {
      settings.bell_button_enabled = device.bellButtonEnabled;
    }

    return settings;
  }

}

module.exports = KeypadDevice;
