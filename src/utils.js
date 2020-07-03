import crypto from 'crypto'
import tunnel from 'tunnel'
import url from 'url'
import path from 'path'

import { ASSET_REGION_MAPPING, TO_STRING_TAG, PARAMETERS_MAP, DEFAULT_PROTOCOL } from './constants'

/**
 * Create HMAC token to receive job assets
 *
 * @param  {string} username  username of user
 * @param  {string} key       access key of user
 * @param  {string} jobId     job id of job you want to get access to
 * @return {string}           hmac token
 */
export function createHMAC (username, key, jobId) {
    const hmac = crypto.createHmac('md5', `${username}:${key}`)
    hmac.write(jobId)
    hmac.end()
    return new Promise((resolve, reject) => hmac.on('readable', () => {
        const data = hmac.read()
        if (!data) {
            return reject(new Error('Could not create HMAC token'))
        }
        return resolve(data.toString('hex'))
    }))
}

/**
 * get sauce API url
 * @param  {string}  hostname  host name of the API that is being used
 * @param  {string}  region    region of the datacenter
 * @param  {boolean} headless  true if job is running on headless instance
 * @param  {string}  protocol  protcol to be used
 * @return {string}            endpoint base url (e.g. `https://us-east1.headless.saucelabs.com`)
 */
export function getAPIHost (servers, basePath, options) {
    /**
     * allows to set an arbitrary host (for internal use only)
     */
    const apiUrl = options.host || servers[0].url
    let host = DEFAULT_PROTOCOL + apiUrl.replace(DEFAULT_PROTOCOL, '') + basePath

    /**
     * allow short region handles to stay backwards compatible
     * ToDo(Christian): consider to remove when making a breaking update
     */
    if (options.region) {
        if (options.region === 'us') options.region = 'us-west-1'
        if (options.region === 'eu') options.region = 'eu-central-1'
        if (options.headless) options.region = 'us-east-1'
    }

    for (const [option, value] of Object.entries(servers[0].variables)) {
        const hostOption = options[option] || value.default

        /**
         * check if option is valid
         */
        if (!value.enum.includes(hostOption)) {
            throw new Error(`Option "${option}" contains invalid value ("${hostOption}"), allowed are: ${value.enum.join(', ')}`)
        }

        host = host.replace(`{${option}}`, hostOption)
    }

    return host
}

/**
 * helper to generate host for assets, like:
 * https://assets.saucelabs.com/jobs/<jobId>/selenium-server.log
 * https://assets.eu-central-1.saucelabs.com/jobs/<jobId>/log.json
 * https://assets.us-east-1.saucelabs.com/jobs/<jobId>/log.json
 * https://assets.staging.saucelabs.net/jobs/<jobId>/log.json
 */
export function getAssetHost (options) {
    if (options.headless) {
        options.region = 'us-east-1'
    }

    if (options.region === 'staging') {
        options.tld = options.tld || 'net'
    }

    const tld = options.tld || 'com'
    const region = ASSET_REGION_MAPPING[options.region] || ''
    return `https://assets.${region}saucelabs.${tld}`
}

/**
 * toString method for proxy instance
 * @param  {object} scope  actual API instance
 * @return {string}        to string output
 */
export function toString (scope) {
    return `${TO_STRING_TAG} {
  username: '${scope.username}',
  key: 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXX${scope._accessKey.slice(-6)}',
  region: '${scope._options.region}',
  headless: ${scope._options.headless},
  proxy: ${scope._options.proxy}
}`
}

/**
 * get sorted list of parameters with full description
 * @param  {Array}    [parameters=[]]  parameter defined in endpoint
 * @return {[Object]}                  full description of parameters
 */
export function getParameters (parameters = []) {
    const params = parameters.map(
        (urlParameter) => urlParameter.$ref
            ? PARAMETERS_MAP.get(urlParameter.$ref.split('/').slice(-1)[0])
            : urlParameter)

    return params.sort((a, b) => {
        if (a.required && b.required) {
            return 0
        }
        if (a.required && !b.required) {
            return -1
        }
        return 1
    })
}

/**
 * type check for endpoint parameters
 * @param  {*}      option        given command parameters
 * @param  {String} expectedType  expected parameter type
 * @return {Boolean}              true if typecheck was ok
 */
export function isValidType (option, expectedType) {
    if (expectedType === 'array') {
        return Array.isArray(option)
    }
    return typeof option === expectedType
}

/**
 * get a tunnel Agent for proxy tunneling
 * @param  {string}  proxy  proxy URL that traffic will be tunneled with
 * @return {Agent} proxy Agent object
 */
export function createProxyAgent (proxy) {
    var proxyURL = url.parse(proxy)
    if (proxyURL.protocol === 'https:') {
        return {
            https: tunnel.httpsOverHttps({
                proxy: {
                    host: proxyURL.hostname,
                    port: proxyURL.port
                }
            })
        }
    } else if (proxyURL.protocol === 'http:') {
        return {
            https: tunnel.httpsOverHttp({
                proxy: {
                    host: proxyURL.hostname,
                    port: proxyURL.port
                }
            })
        }
    }

    throw new Error('Only http and https protocols are supported for proxying traffic.'
                        + `\nWe got ${proxyURL.protocol}`)
}

/**
 * If the environment variable "STRICT_SSL" is defined as "false", it doesn't require SSL certificates to be valid.
 * This is used in requests to define the value of the "strictSSL" option.
 */
export function getStrictSsl() {
    return !(process.env.STRICT_SSL === 'false' || process.env.strict_ssl === 'false')
}
