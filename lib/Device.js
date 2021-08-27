'use strict';

const {OAuth2Device} = require('homey-oauth2app');
const {OperationTypes, LockState} = require('/lib/Enums');

class Device extends OAuth2Device {

  /*
  |-----------------------------------------------------------------------------
  | Device events
  |-----------------------------------------------------------------------------
  */

  /**
   * Device initialized.
   *
   * @async
   * @returns {Promise<void>}
   */
  async onOAuth2Init() {
    this.idle = true;
    this.tedeeId = Number(this.getSetting('tedee_id'));

    // Set device unavailable
    await this.setUnavailable(this.homey.__('connecting'));

    // Set device to idle state
    await this.resetState();

    // Start refresh timer
    await this.homey.app.startTimer();

    // Register capability listeners
    await this.registerCapabilityListeners();

    // Register event listeners
    this.homey.on(`tedee:sync:${this.tedeeId}`, this.setDeviceData.bind(this));

    // Refresh device
    await this.oAuth2Client.syncDevice(this.driver.id, this.tedeeId);
  }

  /**
   * Device deleted.
   *
   * @async
   * @returns {Promise<void>}
   */
  async onOAuth2Deleted() {
    // Remove event listeners for device
    this.homey.removeAllListeners(`tedee:sync:${this.tedeeId}`);
  }

  /*
  |-----------------------------------------------------------------------------
  | Device update functions
  |-----------------------------------------------------------------------------
  */

  /**
   * Set device data.
   *
   * @async
   * @param {object} deviceData
   * @returns {Promise<void>}
   */
  async setDeviceData(deviceData) {
    try {
      await this._setStore(deviceData);
      await this._setSettings(deviceData);
      await this.setCapabilities(deviceData);
      await this.setAvailability(deviceData);
    } catch (err) {
      this.error('Update failed:', err);
      await this.setUnavailable(`Update failed: ${err.message}`);
    }
  }

  /**
   * Set device availability.
   *
   * @async
   * @param {object} deviceData
   * @returns {Promise<void>}
   */
  async setAvailability(deviceData) {
    // Disconnected
    if (deviceData.hasOwnProperty('isConnected') && !deviceData.isConnected) {
      return this.setUnavailable(this.homey.__('state.disconnected'));
    }

    // Updating
    if (deviceData.hasOwnProperty('isUpdating') && deviceData.isUpdating) {
      return this.setUnavailable(this.homey.__('state.updating'));
    }
  }

  /**
   * Set device capabilities.
   *
   * @async
   * @param {object} deviceData
   * @returns {Promise<void>}
   */
  async setCapabilities(deviceData) {
    // Connected capability
    if (deviceData.hasOwnProperty('isConnected')) {
      this.setCapabilityValue('connected', deviceData.isConnected).catch(this.error);
    }

    // Update available capability
    if (deviceData.hasOwnProperty('softwareVersions')) {
      this.setCapabilityValue('update_available', deviceData.softwareVersions[0].updateAvailable).catch(this.error);
    }
  }

  /**
   * Remove or add "open" capability.
   *
   * @async
   * @param {string} pullSpringEnabled
   * @returns {Promise<void>}
   * @private
   */
  async _setOpenCapability(pullSpringEnabled) {
    // Remove capability
    if (this.hasCapability('open') && pullSpringEnabled === 'off') {
      this.log('Pull spring disabled, removing "open" capability');

      return this.removeCapability('open');
    }

    // Add capability
    if (!this.hasCapability('open') && pullSpringEnabled === 'on') {
      this.log('Pull spring enabled, adding "open" capability');

      return this.addCapability('open');
    }
  }

  /**
   * Set device settings.
   *
   * @async
   * @param {object} deviceData
   * @returns {Promise<void>}
   * @private
   */
  async _setSettings(deviceData) {
    // New settings object
    let settings = {}

    // Set connected status
    if (deviceData.hasOwnProperty('isConnected')) {
      settings.status = deviceData.isConnected ? this.homey.__('connected') : this.homey.__('disconnected');
    }

    // Set firmware version
    if (deviceData.hasOwnProperty('softwareVersions')) {
      settings.firmware_version = String(deviceData.softwareVersions[0].version);
    }

    // Set device settings
    if (deviceData.hasOwnProperty('deviceSettings')) {
      settings.auto_lock_enabled = deviceData.deviceSettings.autoLockEnabled ? 'on' : 'off';
      settings.button_lock_enabled = deviceData.deviceSettings.buttonLockEnabled ? 'on' : 'off';
      settings.button_unlock_enabled = deviceData.deviceSettings.buttonUnlockEnabled ? 'on' : 'off';
    }

    // Update device settings
    await this.setSettings(settings);
  }

  /**
   * Set device store values.
   *
   * @async
   * @param {object} deviceData
   * @returns {Promise<void>}
   * @private
   */
  async _setStore(deviceData) {
    if (!deviceData.hasOwnProperty('deviceSettings')) {
      return;
    }

    const pullSpringEnabled = deviceData.deviceSettings.pullSpringEnabled ? 'on' : 'off';

    // Set store values
    await this.setStoreValue('pull_spring_enabled', pullSpringEnabled);

    // Remove or add "open" capability
    await this._setOpenCapability(pullSpringEnabled);
  }

  /*
  |-----------------------------------------------------------------------------
  | Support functions
  |-----------------------------------------------------------------------------
  */

  /**
   * Log error, set device state to idle and throw error.
   *
   * @async
   * @param {string} message
   * @param {string} locale
   * @returns {Promise<void>}
   * @throws {Error}
   */
  async errorIdle(message, locale) {
    this.error(message);

    // Set device to idle state
    await this.resetState();

    throw new Error(this.homey.__(locale));
  }

  /**
   * Register capability listeners.
   *
   * @async
   * @returns {Promise<void>}
   */
  async registerCapabilityListeners() {
    if (this.hasCapability('locked')) {
      this.registerCapabilityListener('locked', this.onCapabilityLocked.bind(this));
    }

    if (this.hasCapability('open')) {
      this.registerCapabilityListener('open', this.onCapabilityOpen.bind(this));
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Device state functions
  |-----------------------------------------------------------------------------
  */

  /**
   * Set device to busy.
   *
   * @returns {Promise<void>}
   */
  async setBusy() {
    if (this.idle) {
      this.log(`${this.driver.id} is now busy`);
    }

    // Set to busy state
    this.idle = false;
  }

  /**
   * Set device to idle.
   *
   * @returns {Promise<void>}
   */
  async resetState() {
    if (!this.idle) {
      this.log(`${this.driver.id} is now idle`);
    }

    if (this.monitor) {
      this.log('Monitor stopped');
    }

    if (this.operationMonitor) {
      this.log('Operation monitor stopped');
    }

    // Reset properties
    this.flowsTriggered = {};
    this.idle = true;
    this.monitor = false;
    this.operationId = false;
    this.operationMonitor = false;

    // Reset open capability
    if (this.hasCapability('open')) {
      this.setCapabilityValue('open', false).catch(this.error);
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Monitor functions
  |-----------------------------------------------------------------------------
  */

  /**
   * Start the operation monitor.
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error}
   */
  async startOperationMonitor() {
    if (!this.operationId) {
      this.log('No operationId found');

      return;
    }

    this.log(`Starting operation monitor for ${this.operationId}`);

    // Check if state monitor monitor is active
    if (this.monitor) {
      this.error('Monitor is active, stopped');

      throw new Error(this.homey.__('state.inUse'));
    }

    await (async () => {
      this.operationMonitor = true;

      let numberOfTries = 0;

      // Set lock to busy
      await this.setBusy();

      while (this.operationMonitor) {
        await new Promise(resolve => setTimeout(resolve, 800));

        // Increment number of tries
        numberOfTries++;

        // Fetch current lock state from tedee API
        const operationData = await this.oAuth2Client.getOperation(this.operationId);
        const status = operationData.status;
        const type = operationData.type;

        // Log current state
        this.log(`Operation status is '${status}' (${numberOfTries})`);

        // Stop operation monitor at 5 or more tries
        if (numberOfTries > 4) {
          await this.errorIdle('Stopping operation monitor, to many tries', 'error.response');
        }

        // Operation monitor is not completed (pending)
        if (status === 'PENDING') {
          continue;
        }

        // Stop operation monitor
        this.operationMonitor = false;
        this.log('Operation monitor stopped');

        // Successful
        if (operationData.result === 0) {
          // Start state monitor
          return this.startMonitor();
        }

        // Error message
        let error = '';

        switch (type) {
          case OperationTypes.Pull:
            error = 'Pull operation failed';
            break;
          case OperationTypes.Close:
            error = 'Close operation failed';
            break;
          case OperationTypes.Open:
            error = 'Open operation failed';
            break;
          default:
            error = 'Unknown operation type';
        }

        await this.errorIdle(error, 'error.response');
      }
    })();
  }

  /**
   * Start the monitor.
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error}
   */
  async startMonitor() {
    this.log('Starting monitor');

    // Check if operation monitor is active
    if (this.operationMonitor) {
      this.error('Operation monitor is active, stopped');

      throw new Error(this.homey.__('state.inUse'));
    }

    await (async () => {
      this.monitor = 'state';

      // Set lock to busy
      await this.setBusy();

      while (this.monitor) {
        await new Promise(resolve => setTimeout(resolve, 800));

        // Fetch current lock state from tedee API
        const deviceData = await this.oAuth2Client.getSyncLock(this.tedeeId);
        const state = deviceData.lockProperties.state;
        const stateName = await this._getLockStateName(state);

        // Log current state
        this.log(`Lock is ${stateName}`);

        // State is pulling or pulled
        if (state === LockState.Pulling || state === LockState.Pulled) {
          await this.driver.triggerOpened(this);
        }

        // State is locked
        if (state === LockState.Locked) {
          this.setCapabilityValue('locked', true).catch(this.error);
        }

        // State is unlocked
        if (state === LockState.Unlocked) {
          this.setCapabilityValue('locked', false).catch(this.error);
        }

        // State is semi locked (show as unlocked for safety reasons)
        if (state === LockState.SemiLocked) {
          this.setCapabilityValue('locked', false).catch(this.error);
        }

        // Check if state monitor is still needed
        if (!this.needsMonitor(state)) {
          // Set device to idle state
          await this.resetState();

          // Final sync to make sure the states are correct
          await this.oAuth2Client.syncLock(this.tedeeId);
        }
      }
    })();
  }

  /**
   * Verify if the state monitor needs to be started or continue.
   *
   * @async
   * @param {number} stateId
   * @returns {boolean}
   */
  needsMonitor(stateId) {
    return this.getAvailable() &&
        (stateId === LockState.Locking ||
            stateId === LockState.Unlocking ||
            stateId === LockState.Pulled ||
            stateId === LockState.Pulling);
  }

  /*
  |-----------------------------------------------------------------------------
  | Trigger helpers
  |-----------------------------------------------------------------------------
  */

  /**
   * Add trigger to triggered list.
   *
   * @param {string} trigger
   */
  addTriggered(trigger) {
    this.log(`Trigger '${trigger}' is triggered`);

    this.flowsTriggered[trigger] = true;
  }

  /**
   * Return if given flow is already triggered.
   *
   * @param {string} trigger
   * @returns {boolean}
   */
  alreadyTriggered(trigger) {
    return this.flowsTriggered.hasOwnProperty(trigger);
  }

}

module.exports = Device;
