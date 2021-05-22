'use strict';

const {OAuth2App} = require('homey-oauth2app');
const Client = require('./lib/Client');
const {Log} = require('homey-log');

const syncLocksInterval = 10 * 1000; // 10 seconds
const refreshDevicesInterval = 5 * 60 * 1000; // 5 minutes

class Tedee extends OAuth2App {

  static OAUTH2_CLIENT = Client;
  // static OAUTH2_DEBUG = true;

  /*
  |-----------------------------------------------------------------------------
  | Application events
  |-----------------------------------------------------------------------------
  */

  /**
   * Application initialized.
   *
   * @async
   * @returns {Promise<void>}
   */
  async onOAuth2Init() {
    this.log('Application initialized');

    // Sentry logging
    this.homeyLog = new Log({ homey: this.homey });

    // Reset timers
    this.refreshTimer = null;
    this.syncTimer = null;

    // Register flow cards
    this._registerActionFlowCards();
    this._registerConditionFlowCards();

    // Start timers if not already started
    this.homey.setInterval(this._startTimers.bind(this), 5000);

    // Register app event listeners
    this.homey.on('cpuwarn', () => {
      this.log('-- CPU warning! --');
    }).on('memwarn', () => {
      this.log('-- Memory warning! --');
    }).on('unload', () => {
      // Stop timers
      this._stopTimers();

      this.log('-- Unloaded! _o/ --');
    });
  }

  /*
  |-----------------------------------------------------------------------------
  | Application actions
  |-----------------------------------------------------------------------------
  */

  /**
   * Refresh devices (full update).
   *
   * @async
   * @returns {Promise<void>}
   * @private
   */
  async _refreshDevices() {
    await this._updateDevices('refresh');
  }

  /**
   * Sync locks (delta update).
   *
   * @async
   * @returns {Promise<void>}
   * @private
   */
  async _syncLocks() {
    await this._updateDevices('sync');
  }

  /**
   * Update devices by action.
   *
   * @async
   * @param {string} action
   * @returns {Promise<void>}
   * @private
   */
  async _updateDevices(action) {
    try {
      // Verify action
      if (action !== 'refresh' && action !== 'sync') {
        return this.log(`Invalid action: ${action}`);
      }

      // Set oAuth client
      this.oAuth2Client = this.getFirstSavedOAuth2Client();

      let data;

      // Fetch requested data from tedee API
      if (action === 'refresh') {
        data = await this.oAuth2Client.getAllDevicesDetails();
      } else if (action === 'sync') {
        data = await this.oAuth2Client.getSyncLocks();
      }

      // Update devices from list
      await this._updateDevicesList(data);
    } catch (err) {
      await this._stopTimers(err.message);
    }
  }

  /**
   * Update devices from list of tedee devices.
   *
   * @async
   * @param {object} list
   * @returns {Promise<void>}
   * @private
   */
  async _updateDevicesList(list) {
    // Search for devices and set data
    const drivers = this.homey.drivers.getDrivers();

    for (const driverId in drivers) {
      if (!drivers.hasOwnProperty(driverId)) {
        return;
      }

      const devices = drivers[driverId].getDevices();

      for (const device of devices) {
        for (const data of list) {
          if (data.id !== Number(device.getSetting('tedee_id'))) {
            continue;
          }

          await device.setDeviceData(data);
        }
      }
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Timers actions
  |-----------------------------------------------------------------------------
  */

  /**
   * Start timers.
   *
   * @async
   * @returns {Promise<void>}
   * @private
   */
  async _startTimers() {
    try {
      // Check if timers are already running
      if (await this._timersAreRunning()) {
        return;
      }

      // Throws error if none is available, and stop timer
      this.oAuth2Client = this.getFirstSavedOAuth2Client();

      this.log('Starting timers');

      // Start interval for delta updates
      this.syncTimer = this.homey.setInterval(this._syncLocks.bind(this), syncLocksInterval);

      // Start interval for full updates
      this.refreshTimer = this.homey.setInterval(this._refreshDevices.bind(this), refreshDevicesInterval);
    } catch (err) {
      await this._stopTimers(err.message);
    }
  }

  /**
   * Stop timers.
   *
   * @async
   * @param {string|null} reason
   * @returns {Promise<void>}
   * @private
   */
  async _stopTimers(reason = null) {
    if (! await this._timersAreRunning()) {
      return;
    }

    // Logging
    if (reason == null) {
      this.log('Stopping timers');
    } else {
      this.log(`Stopping timers: ${reason}`);
    }

    // Stop delta updates
    if (this.syncTimer != null) {
      this.homey.clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    // Stop full updates
    if (this.refreshTimer != null) {
      this.homey.clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Return if timers are running.
   *
   * @async
   * @returns {Promise<boolean>}
   * @private
   */
  async _timersAreRunning() {
    return this.syncTimer != null && this.refreshTimer != null;
  }

  /**
   * Verify timers.
   *
   * @async
   * @returns {Promise<void>}
   */
  async verifyTimers() {
    try {
      const drivers = this.homey.drivers.getDrivers();
      let devices = 0;

      if (Object.keys(drivers).length === 0) {
        return this._stopTimers();
      }

      for (const driverId in drivers) {
        if (!drivers.hasOwnProperty(driverId)) {
          return;
        }

        // Get driver
        const driver = this.homey.drivers.getDriver(driverId);

        // Add number of devices
        devices += Object.keys(driver.getDevices()).length;
      }

      // Stop timers when no devices found
      if (devices === 0) {
        return this._stopTimers('No devices found');
      }

      return this._startTimers();
    } catch (err) {
      this.error('Verify timers:', err.message);
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Flow cards
  |-----------------------------------------------------------------------------
  */

  /**
   * Register condition flow cards.
   *
   * @returns {void}
   * @private
   */
  _registerConditionFlowCards() {
    // ... and is charging ...
    this.homey.flow.getConditionCard('charging').registerRunListener(async (args) => {
      return args.device.getCapabilityValue('charging') === true;
    });

    // ... and is connected ...
    this.homey.flow.getConditionCard('connected').registerRunListener(async (args) => {
      return args.device.getCapabilityValue('connected') === true;
    });

    // ... and update is available ...
    this.homey.flow.getConditionCard('update_available').registerRunListener(async (args) => {
      return args.device.getCapabilityValue('update_available') === true;
    });
  }

  /**
   * Register action flow cards.
   *
   * @returns {void}
   * @private
   */
  _registerActionFlowCards() {
    // ... then pull the spring ...
    this.homey.flow.getActionCard('open').registerRunListener(async (args) => {
      return args.device.open();
    });
  }

}

module.exports = Tedee;
