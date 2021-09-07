'use strict';

const {OAuth2Client} = require('homey-oauth2app');

class Client extends OAuth2Client {

  static API_URL = 'https://api.tedee.com/api/v1.21';
  static TOKEN_URL = 'https://tedee.b2clogin.com/tedee.onmicrosoft.com/B2C_1A_Signup_Signin_With_Kmsi/oauth2/v2.0/token';
  static AUTHORIZATION_URL = 'https://tedee.b2clogin.com/tedee.onmicrosoft.com/B2C_1A_Signup_Signin_With_Kmsi/oauth2/v2.0/authorize';
  static SCOPES = [
    'offline_access',
    'https://tedee.onmicrosoft.com/api/user_impersonation',
    'https://tedee.onmicrosoft.com/api/Device.ReadWrite',
    'https://tedee.onmicrosoft.com/api/Lock.Operate'
  ];

  /*
  |-----------------------------------------------------------------------------
  | Client events
  |-----------------------------------------------------------------------------
  */

  async onHandleNotOK({body, status, statusText, headers}) {
    this.error('Request not OK', JSON.stringify({
      body: body,
      status: status,
      statusText: statusText,
      headers: headers
    }));

    switch (status) {
      case 401:
        return new Error(this.homey.__('error.401'));
      case 403:
        return new Error(this.homey.__('error.403'));
      case 404:
        return new Error(this.homey.__('error.404'));
      default:
        return new Error(this.homey.__('error.50x'));
    }
  }

  /**
   * Request error.
   *
   * @async
   * @param {Error} err
   * @returns {Promise<void>}
   * @throws {Error}
   */
  async onRequestError({err}) {
    this.error('Request error:', err.message);

    throw new Error(this.homey.__('error.50x'));
  }

  /*
  |-----------------------------------------------------------------------------
  | Synchronize actions
  |-----------------------------------------------------------------------------
  */

  /**
   * Sync bridge data from tedee API.
   *
   * @async
   * @param {number} tedeeId
   * @returns {Promise<void>}
   */
  async syncBridge(tedeeId) {
    this.log(`Fetching bridge ${tedeeId}`);

    const response = await this.get({
      path: `/my/bridge/${tedeeId}`,
      query: '',
      headers: {}
    });

    this.log(`Bridge ${tedeeId} response:`, JSON.stringify(response));

    const data = response.result;

    this.homey.emit('tedee:sync', data);
  }

  /**
   * Sync device from tedee API.
   *
   * @async
   * @param {string} driverId
   * @param {number} tedeeId
   * @returns {Promise<void>}
   */
  async syncDevice(driverId, tedeeId) {
    if (driverId === 'lock') {
      return this.syncLock(tedeeId);
    }

    return this.syncBridge(tedeeId);
  }

  /**
   * Sync devices for driver with details from tedee API.
   *
   * @async
   * @returns {Promise<Object>}
   */
  async syncDevices() {
    const response = await this.get({
      path: '/my/device/details',
      query: '',
      headers: {}
    });

    const result = response.result;
    let devices = [];

    // Get bridges
    if (result.hasOwnProperty('bridges')) {
      devices.push.apply(devices, result.bridges);
    }

    // Get locks
    if (result.hasOwnProperty('locks')) {
      devices.push.apply(devices, result.locks);
    }

    devices.forEach(data => {
      this.homey.emit('tedee:sync', data);
    });
  }

  /**
   * Sync bridge data from tedee API.
   *
   * @async
   * @param {number} tedeeId
   * @returns {Promise<void>}
   */
  async syncLock(tedeeId) {
    this.log(`Synchronize lock ${tedeeId}`);

    const data = await this.getLock(tedeeId);

    this.homey.emit('tedee:sync', data);
  }

  /**
   * Sync data of all locks from tedee API (delta update).
   *
   * @async
   * @returns {Promise<Object>}
   */
  async syncLocks() {
    const response = await this.get({
      path: '/my/lock/sync',
      query: '',
      headers: {}
    });

    response.result.forEach(data => {
      this.homey.emit('tedee:sync', data);
    });
  }

  /*
  |-----------------------------------------------------------------------------
  | Client actions
  |-----------------------------------------------------------------------------
  */

  /**
   * Fetch devices for driver with details from tedee API.
   *
   * @async
   * @param {string} driverId
   * @returns {Promise<Object>}
   */
  async getDevicesDetails(driverId) {
    this.log(`Fetching ${driverId} devices with details`);

    const response = await this.get({
      path: `/my/${driverId}`,
      query: '',
      headers: {}
    });

    return response.result;
  }

  /**
   * Fetch lock data from tedee API.
   *
   * @async
   * @param {number} tedeeId
   * @returns {Promise<Object>}
   */
  async getLock(tedeeId) {
    this.log(`Fetching lock ${tedeeId}`);

    const response = await this.get({
      path: `/my/lock/${tedeeId}`,
      query: '',
      headers: {}
    });

    this.log(`Lock ${tedeeId} response:`, JSON.stringify(response));

    return response.result;
  }

  /**
   * Fetch lock state from tedee API.
   *
   * @async
   * @param {number} tedeeId
   * @returns {Promise<number>}
   */
  async getLockState(tedeeId) {
    this.log(`Fetching lock state for ${tedeeId}`);

    const result = await this.getSyncLock(tedeeId);

    if (result.hasOwnProperty('lockProperties')) {
      return result.lockProperties.state;
    }
  }

  /**
   * Fetch operation from tedee API.
   *
   * @async
   * @param {string} operationId
   * @returns {Promise<Object>}
   * @throws {Error}
   */
  async getOperation(operationId) {
    if (operationId.length === 0) {
      this.error('Operation ID is blank');

      throw new Error(this.homey.__('error.response'));
    }

    this.log(`Fetching operation ${operationId}`);

    const response = await this.get({
      path: `/my/device/operation/${operationId}`,
      query: '',
      headers: {}
    });

    this.log(`Operation ${operationId} response:`, JSON.stringify(response));

    return response.result;
  }

  /**
   * Fetch revision for lock from tedee API.
   *
   * @async
   * @param {number} tedeeId
   * @returns {Promise<number>}
   */
  async getRevision(tedeeId) {
    const result = await this.getLock(tedeeId);

    return result.revision;
  }

  /**
   * Fetch lock sync from tedee API.
   *
   * @async
   * @param {number} tedeeId
   * @returns {Promise<Object>}
   */
  async getSyncLock(tedeeId) {
    const response = await this.get({
      path: `/my/lock/${tedeeId}/sync`,
      query: '',
      headers: {}
    });

    return response.result;
  }

  /**
   * Send `lock` command for lock.
   *
   * @async
   * @param {number} tedeeId
   * @returns {Promise<string>}
   * @throws {Error}
   */
  async lock(tedeeId) {
    this.log(`Sending "lock" command for lock ${tedeeId}`);

    const response = await this.post({
      path: `/my/lock/${tedeeId}/operation/lock`,
      query: '',
      json: null,
      body: null,
      headers: {}
    });

    this.log(`Lock ${tedeeId} response:`, JSON.stringify(response));

    if (response.result.hasOwnProperty('operationId')) {
      return response.result.operationId;
    }

    throw new Error(this.homey.__('error.response'));
  }

  /**
   * Send `pull` command for lock.
   *
   * @async
   * @param {number} tedeeId
   * @returns {Promise<string>}
   * @throws {Error}
   */
  async pullSpring(tedeeId) {
    this.log(`Sending "pull" command for lock ${tedeeId}`);

    const response = await this.post({
      path: `/my/lock/${tedeeId}/operation/pull`,
      query: '',
      json: null,
      body: null,
      headers: {}
    });

    this.log(`Pull ${tedeeId} response:`, JSON.stringify(response));

    if (response.result.hasOwnProperty('operationId')) {
      return response.result.operationId;
    }

    throw new Error(this.homey.__('error.response'));
  }

  /**
   * Send `unlock` command for lock.
   *
   * @async
   * @param {number} tedeeId
   * @returns {Promise<string>}
   * @throws {Error}
   */
  async unlock(tedeeId) {
    this.log(`Sending "unlock" command for lock ${tedeeId}`);

    const response = await this.post({
      path: `/my/lock/${tedeeId}/operation/unlock`,
      query: '',
      json: null,
      body: null,
      headers: {}
    });

    this.log(`Unlock ${tedeeId} response:`, JSON.stringify(response));

    if (response.result.hasOwnProperty('operationId')) {
      return response.result.operationId;
    }

    throw new Error(this.homey.__('error.response'));
  }

  /**
   * Update lock settings.
   *
   * @async
   * @param {number} tedeeId
   * @param {object} deviceSettings
   * @returns {Promise<void>}
   */
  async updateLockSettings(tedeeId, deviceSettings) {
    this.log(`Updating settings for lock ${tedeeId}:`, JSON.stringify(deviceSettings));

    const response = await this.patch({
      path: '/my/lock',
      query: '',
      json: {
        id: tedeeId,
        revision: await this.getRevision(tedeeId),
        deviceSettings: deviceSettings
      },
      body: null,
      headers: {}
    });

    this.log(`Update settings ${tedeeId} response:`, JSON.stringify(response));
  }

}

module.exports = Client;
