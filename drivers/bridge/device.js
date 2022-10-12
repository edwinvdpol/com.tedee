'use strict';

const Device = require('../../lib/Device');
const { filled } = require('../../lib/Utils');

class BridgeDevice extends Device {

  /*
  | Synchronization functions
  */

  // Return data which need to be synced
  async getSyncData() {
    return this.oAuth2Client.getBridge(this.getSetting('tedee_id'));
  }

  // Set availability
  async setAvailability(data) {
    // Updating
    if (filled(data.isUpdating) && data.isUpdating) {
      throw new Error(this.homey.__('state.updating'));
    }

    // Disconnected
    if (filled(data.isConnected) && !data.isConnected) {
      throw new Error(this.homey.__('state.disconnected'));
    }

    this.setAvailable().catch(this.error);
  }

  /*
  | Support functions
  */

  // Returns settings from given data
  getNewSettings(data) {
    const settings = {};

    // Set connected status
    if (filled(data.isConnected)) {
      settings.status = data.isConnected
        ? this.homey.__('connected')
        : this.homey.__('disconnected');
    }

    return settings;
  }

}

module.exports = BridgeDevice;
