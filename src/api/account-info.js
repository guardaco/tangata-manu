// @flow

import { zip as zipArrays, chain as lodashChain } from 'lodash'

import type { Logger } from 'bunyan'

import { Request, Response } from 'restify'
import { Controller, Post } from 'inversify-restify-utils'
import { Controller as IController } from 'inversify-restify-utils/lib/interfaces'
import { decorate } from 'inversify'
import { helpers } from 'inversify-vanillajs-helpers'

import { JormungandrApi } from '../entities/raw-data-providers'
import { shelleyUtils } from '../blockchain/shelley'

import SERVICE_IDENTIFIER from '../constants/identifiers'

class AccountInfoController implements IController {
  logger: Logger

  dataProvider: JormungandrApi

  constructor(
    logger: Logger,
    dataProvider: JormungandrApi,
  ) {
    this.logger = logger
    this.dataProvider = dataProvider
  }

  async accountInfo(req: Request, resp: Response, next: Function) {
    const doResp = (status, statusText, respBody) => {
      resp.status(status)
      // eslint-disable-next-line no-param-reassign
      resp.statusText = statusText
      resp.send(respBody)
      next()
    }
    let statusText
    let status
    let respBody
    const addresses = req.body.addresses
    if (!Array.isArray(addresses) || addresses.length > 50) {
      return doResp(400, 'BadParam',
        '`addresses` should be a valid array of no more than 50 account addresses')
    }
    this.logger.debug('Account info for addresses:', JSON.stringify(addresses))
    const promises = addresses.map(addr => {
      const { accountId, type, comment } = shelleyUtils.getAccountIdFromAddress(addr)
      if (accountId) {
        // returning promise here to make queries parallel
        return this.dataProvider.getAccountState(accountId)
      } else {
        this.logger.debug('Failed to query account state for address:', JSON.stringify({ addr, type, comment }))
        return {
          error: 'address is not a correct supported account',
          comment,
        }
      }
    })
    const resolved = await Promise.all(promises)
    this.logger.debug('Resolved account state promises: ', addresses, resolved)
    status = 200
    statusText = '@ok'
    respBody = lodashChain(zipArrays(addresses, resolved))
      .keyBy(0)
      .mapValues(1)
      .value()
    resp.status(status)
    // eslint-disable-next-line no-param-reassign
    resp.statusText = statusText
    resp.send(respBody)
    next()
  }
}

helpers.annotate(AccountInfoController, [
  SERVICE_IDENTIFIER.LOGGER,
  SERVICE_IDENTIFIER.RAW_DATA_PROVIDER,
])

decorate(Controller('/api'), AccountInfoController)
decorate(Post('/account/state'), AccountInfoController.prototype, 'accountInfo')

export default AccountInfoController
