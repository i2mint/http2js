// tslint:disable-next-line:no-var-requires
const fetch: any = typeof window !== 'undefined' ? window.fetch : require('node-fetch');
import * as _ from 'lodash';
import { getGlobalState } from './global-state';

export const enum AUTH_TYPES {
    UNSECURED = 'unsecured',
    API_KEY = 'apiKey',
    JWT = 'bearerAuth',
}

export const enum HTTP_METHODS {
    GET = 'GET',
    PUT = 'PUT',
    POST = 'POST',
    DELETE = 'DELETE',
}

export default class Http2jsClient {
    apiKey: string = '';
    authType: AUTH_TYPES = AUTH_TYPES.UNSECURED;
    baseUrl: string = '';
    sessionState: any;
    loginArgs: any = {};
    loginResponseKeys: string[] = [];
    loginUrl: string = '';
    refreshExpiration: number = 0;
    refreshInputKeys: string[] = [];
    title: string = '';
    version: string = '';

    get header(): any {
        return this.sessionState.header
    }
    set header(value: any) {
        this.sessionState.header = value
    }
    get refreshInputs(): any {
        return this.sessionState.refreshInputs
    }
    set refreshInputs(value: any) {
        this.sessionState.refreshInputs = value
    }

    constructor(openapiSpec, auth, sessionState: any = null) {
        const serverInfo: any = openapiSpec.info;
        this.title = serverInfo.title;
        this.version = serverInfo.version;
        this.baseUrl = openapiSpec.servers[0].url;
        const security: any = openapiSpec.security;
        if (security && auth) {
            this.initSecurity(openapiSpec, auth);
        }
        _.forEach(openapiSpec.paths, (pathSpec: any, pathname: string) =>
            _.forEach(pathSpec, (methodSpec: any, methodname: string) =>
                this.registerMethod(pathname, methodname.toUpperCase(), methodSpec)));
        this.sessionState = sessionState ? sessionState : getGlobalState(
            'sessionState',
            {header: {}, refreshInputs: {}}
        )
    }

    initSecurity(openapiSpec, auth): void {
        const security: any = openapiSpec.security;
        const authType: AUTH_TYPES = _.keys(security)[0];
        this.authType = authType;
        switch (authType) {
            case AUTH_TYPES.API_KEY:
                this.apiKey = auth.apiKey;
                this.header = {'Authorization': this.apiKey}
                break;
            case AUTH_TYPES.JWT:
                const loginDetails: any = openapiSpec.components.securitySchemes.bearerAuth['x-login'];
                this.loginUrl = loginDetails.login_url;
                const authArgs: string[] = loginDetails.login_inputs;
                this.loginArgs = {};
                _.forEach(authArgs, (key: string) => {
                    this.loginArgs[key] = auth[key] || '';
                });
                this.refreshInputKeys = loginDetails.refresh_inputs || [];
                this.loginResponseKeys = loginDetails.outputs || [];
                break;
            default:
                break;
        }
        return;
    }

    registerMethod(pathname: string, httpMethod: string, methodSpec: any): void {
        const url: string = this.baseUrl + pathname;
        const contentType: string = _.keys(methodSpec.requestBody.content)[0];
        const methodName: string = methodSpec['x-method_name'] || pathname;
        const argNames: string[] = _.keys(methodSpec.requestBody.content[contentType].schema.properties);
        this[methodName] = (methodArgs: any) => {
            const fetchOptions: any = {
                headers: { ...this.header, 'Content-type': contentType },
                method: httpMethod,
            };
            if (httpMethod !== HTTP_METHODS.GET) {
                const requestBody: any = _.pick(methodArgs, argNames);
                fetchOptions.body = JSON.stringify(requestBody);
            }
            return this.handleRequest(url, fetchOptions);
        };
    }

    handleRequest(url, fetchOptions): Promise<any> {
        return this.ensureLogin()
            .then(() => {
                if (!fetchOptions.headers) {
                    fetchOptions.headers = this.header;
                } else {
                    fetchOptions.headers.Authorization = this.header.Authorization;
                }
                return fetch(url, fetchOptions);
            }).then((response: Response) => response.json())
    }

    ensureLogin(): Promise<any> {
        if (this.authType !== AUTH_TYPES.JWT) {
            return Promise.resolve(true);
        } else if (this.header.Authorization) {
            if (this.refreshExpiration) {
                const now: number = Date.now();
                if (now > this.refreshExpiration) {
                    if (_.keys(this.refreshInputs).length) {
                        return this.refreshLogin();
                    }
                    return this.login();
                }
            }
        }
        return this.login();
    }

    login(): Promise<void> {
        return fetch(this.loginUrl, {
            body: JSON.stringify(this.loginArgs),
            headers: {'Content-type': 'application/json'},
            method: 'POST',
        }).then((rawResponse: Response) => rawResponse.json())
        .then((loginResult: any) => this.receiveLogin(loginResult));
    }

    refreshLogin(): Promise<void> {
        return Promise.resolve();
    }

    receiveLogin(loginResult: any): void {
        if (loginResult.refresh_expiration) {
            this.refreshExpiration = loginResult.refresh_expiration;
        }
        _.forEach(this.loginResponseKeys, (key: string) => {
            const value: string = loginResult[key] || '';
            if (key === 'jwt') {
                if (!this.header) {
                    this.header = {};
                }
                this.header.Authorization = `Bearer ${value}`;
            } else if (this.refreshInputKeys.includes(key)) {
                this.refreshInputs[key] = value;
            }
        })
    }
}