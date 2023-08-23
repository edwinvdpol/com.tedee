'use strict';

const Driver = require('../../lib/Driver');
const { filled } = require('../../lib/Utils');

class LockDriver extends Driver {

  /*
  | Driver events
  */

  // Driver initialized
  async onOAuth2Init() {
    // Register device flow cards
    this.registerDeviceFlowCards();

    // Initialise parent driver
    await super.onOAuth2Init();
  }

  /*
  | Pairing functions
  */

  // Return settings value while pairing
  getPairSettings(device) {
    return {
      status: device.isConnected ? this.homey.__('settings.connected') : this.homey.__('settings.disconnected'),
      tedee_id: `${device.id}`,
      firmware_version: device.softwareVersions[0].version,
      serial_number: device.serialNumber,
      mac_address: device.macAddress,
      auto_lock_enabled: device.deviceSettings.autoLockEnabled,
      button_lock_enabled: device.deviceSettings.buttonLockEnabled,
      button_unlock_enabled: device.deviceSettings.buttonUnlockEnabled,
      postponed_lock_enabled: device.deviceSettings.postponedLockEnabled,
      postponed_lock_delay: device.deviceSettings.postponedLockDelay,
    };
  }

  // Return store value while pairing
  getPairStore(device) {
    return {
      connected_via_bridge: filled(device.connectedToId),
      pull_spring_enabled: device.deviceSettings.pullSpringEnabled,
    };
  }

  /*
  | Flow cards functions
  */

  // Register device flow cards
  registerDeviceFlowCards() {
    // When lock was pulled ...
    this.lockPulled = this.homey.flow.getDeviceTriggerCard('pulled');
  }

  // Pulled flow trigger
  triggerPulled(lock) {
    if (!lock.hasCapability('open')) return;

    this.lockPulled.trigger(lock, {}).then().catch(lock.error);
  }

}

module.exports = LockDriver;
