'use strict';

const Device = require('/lib/Device');

class BridgeDevice extends Device {

  /**
   * Set device availability.
   *
   * @async
   * @param {object} data
   * @returns {Promise<void>}
   */
  async setAvailability(data) {
    await super.setAvailability(data);

    // Set available if currently not available
    if (!this.getAvailable()) {
      await this.setAvailable();
    }
  }

}

module.exports = BridgeDevice;
