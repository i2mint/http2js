// tslint:disable-next-line:no-var-requires
const fetch: any = window ? window.fetch : require('node-fetch');
import { getGlobalState } from './global-state';

const parseJwt = (token) => {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));

    return JSON.parse(jsonPayload);
};

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
    apiKey = '';
    authType: AUTH_TYPES = AUTH_TYPES.UNSECURED;
    baseUrl = '';
    endpoints: any = {};
    jwt = '';
    jwtExpiration = 0;
    loggedIn = false;
    loginArgs: any = {};
    loginResponseKeys: string[] = [];
    loginUrl = '';
    persistKey = '';
    refreshExpiration = 0;
    refreshInputKeys: Set<string> = new Set([]);
    refreshToken = '';
    refreshUrl = '';
    sessionState: any;
    title = '';
    version = '';

    // get header(): any {
    //     return this.sessionState.header;
    // }
    get refreshInputs(): any {
        return this.sessionState.refreshInputs;
    }
    set refreshInputs(value: any) {
        this.sessionState.refreshInputs = value;
    }

    constructor(openapiSpec, auth, sessionState: any = null, options: any = null) {
        const serverInfo: any = openapiSpec.info;
        this.title = serverInfo.title;
        this.version = serverInfo.version;
        this.baseUrl = openapiSpec.servers[0].url;
        this.endpoints = {};
        this.sessionState = sessionState ? sessionState : getGlobalState(
            'sessionState',
            { header: {}, refreshInputs: this.refreshInputs },
        );
        const security: any = openapiSpec.security;
        if (options && options.persistKey && localStorage) {
            this.persistKey = options.persistKey;
        }
        if (security) {
            this.initSecurity(openapiSpec, auth);
        }
        Object.keys(openapiSpec.paths).forEach((pathname: string) => {
            const pathSpec = openapiSpec.paths[pathname];
            Object.keys(pathSpec).forEach((methodname: string) => {
                const methodSpec = pathSpec[methodname];
                this.registerMethod(pathname, methodname.toUpperCase(), methodSpec);
            });
        });
    }

    registerJwt(jwt: string) {
        try {
            const parsed = parseJwt(jwt);
            this.jwtExpiration = parsed.exp * 1000;
            this.jwt = jwt;
            this.sessionState.header.Authorization = `Bearer ${jwt}`;
            this.loggedIn = true;
        } catch (e) {
            console.error({ e });
            this.loggedIn = false;
            this.sessionState.header.Authorization = '';
            this.jwt = '';
        }
    }

    registerAuth(auth, authArgs, newRefreshInputs) {
        Object.keys(auth).forEach((key: string) => {
            const value = auth[key];
            if (key === 'refresh_expiration') {
                if (value && value < 10000000000) {
                    this.refreshExpiration = value * 1000;
                } else {
                    this.refreshExpiration = value;
                }
            } else if (key === 'jwt') {
                if (!this.sessionState.header) {
                    this.sessionState.header = {};
                }
                this.registerJwt(value);
            } else {
                if (key === 'refresh_token') {
                    this.refreshToken = value;
                }
                if (authArgs.has(key)) {
                    this.loginArgs[key] = value;
                }
                if (this.refreshInputKeys.has(key)) {
                    newRefreshInputs[key] = value;
                }
            }
        });
    }

    initSecurity(openapiSpec, auth): void {
        const security: any = openapiSpec.security;
        const authType: string = Object.keys(security)[0];
        this.authType = authType as AUTH_TYPES;
        switch (authType) {
            case AUTH_TYPES.API_KEY:
                this.apiKey = auth.apiKey;
                this.sessionState.header = {'Authorization': this.apiKey}
                break;
            case AUTH_TYPES.JWT:
                const loginDetails: any = openapiSpec.components.securitySchemes.bearerAuth['x-login'];
                this.loginUrl = loginDetails.login_url;
                this.refreshUrl = loginDetails.refresh_url;
                this.loginResponseKeys = loginDetails.outputs || [];
                this.refreshInputKeys = new Set(loginDetails.refresh_inputs || []);
                this.loginArgs = {};
                const newRefreshInputs: any = {};
                const persistedData = this.persistKey ?
                    this.importPersistedData(newRefreshInputs) : {};
                if (auth) {
                    const authArgs: Set<string> = new Set(loginDetails.login_inputs || []);
                    this.registerAuth(auth, authArgs, newRefreshInputs);
                }
                this.refreshInputs = newRefreshInputs;
                this.persistLoginResult({ ...persistedData, ...auth });
                break;
            default:
                break;
        }
        return;
    }

    registerMethod(pathname: string, httpMethod: string, methodSpec: any): void {
        let url: string = this.baseUrl + pathname;
        const contentType: string = httpMethod === HTTP_METHODS.GET ? '' : Object.keys(methodSpec.requestBody.content)[0];
        const methodName: string = methodSpec['x-method_name'] || pathname;
        const pathArgNames: string[] = !!methodSpec.parameters ?
          methodSpec.parameters.filter((e) => e.in === 'path').map((e) => e.name) : [];
        const queryArgNames: string[] = !!methodSpec.parameters ?
          methodSpec.parameters.filter((e) => e.in === 'query').map((e) => e.name) : [];
        const bodyArgNames: string[] = !!methodSpec.requestBody ?
          Object.keys(methodSpec.requestBody.content[contentType].schema.properties) : [];
        this.endpoints[methodName] = (methodArgs: any) => {
            const fetchOptions: any = {
                headers: { ...this.sessionState.header, 'Content-type': contentType },
                method: httpMethod,
            };
            if (pathArgNames.length) {
                for (const argName of pathArgNames) {
                    const regex = new RegExp(`{${pathArgNames}}`);
                    const argValue = methodArgs[argName]
                    url = url.replace(regex, argValue)
                }
            }
            if (queryArgNames.length) {
                const urlArgParts: string[] = queryArgNames.filter(
                  (e) => e in methodArgs).map((e) => `${e}=${methodArgs[e]}`)
                const urlArgs = urlArgParts.join('&')
                url += `?${urlArgs}`
            }
            if (bodyArgNames.length) {
                const requestBody: any = {};
                bodyArgNames.forEach((arg) => {
                    requestBody[arg] = methodArgs[arg];
                });
                fetchOptions.body = JSON.stringify(requestBody);
            }
            return this.handleRequest(url, fetchOptions, methodName === 'ping');
        };
        this.endpoints[methodName].methodName = methodName;
    }

    handleRequest(url, fetchOptions, skipLogin): Promise<any> {
        return this.ensureLogin(skipLogin)
            .then(() => fetch(url, fetchOptions))
            .then((response: Response) => response.json());
    }

    ensureLogin(skip: boolean): Promise<any> {
        if (skip || this.authType !== AUTH_TYPES.JWT) {
            return Promise.resolve(true);
        } else {
            const now: number = Date.now();
            if (this.sessionState.header && this.sessionState.header.Authorization &&
              this.jwtExpiration && now < this.jwtExpiration) {
                this.loggedIn = true;
                return Promise.resolve();
            }
            if (this.refreshExpiration && now < this.refreshExpiration) {
                if (Object.keys(this.refreshInputs).length) {
                    return this.refreshLogin();
                }
            }
        }
        return this.login();
    }

    login(loginArgs?: any): Promise<void> {
        if (loginArgs) {
            this.loginArgs = loginArgs;
        }
        return fetch(this.loginUrl, {
            body: JSON.stringify(this.loginArgs),
            headers: {'Content-type': 'application/json'},
            method: 'POST',
        }).then((rawResponse: Response) => rawResponse.json())
        .then((loginResult: any) => this.receiveLogin(loginResult))
        .catch((loginFail) => this.receiveLoginFail(loginFail));
    }

    refreshLogin(): Promise<void> {
        return fetch(this.refreshUrl, {
            body: JSON.stringify(this.refreshInputs),
            headers: {'Content-type': 'application/json'},
            method: 'POST',
        }).then((rawResponse: Response) => rawResponse.json())
        .then((loginResult: any) => this.receiveLogin(loginResult))
        .catch((loginFail) => this.receiveLoginFail(loginFail));
    }

    receiveLogin(loginResult: any): void {
        this.persistLoginResult(loginResult);
        if (loginResult.refresh_expiration) {
            let refreshExpiration = loginResult.refresh_expiration;
            if (refreshExpiration && refreshExpiration < 10000000000) {
                refreshExpiration = refreshExpiration * 1000;
            }
            this.refreshExpiration = refreshExpiration;
        }
        this.loginResponseKeys.forEach((key: string) => {
            const value: string = loginResult[key] || '';
            if (key === 'jwt') {
                if (!this.sessionState.header) {
                    this.sessionState.header = {};
                }
                this.registerJwt(value);
            } else if (this.refreshInputKeys.has(key)) {
                if (key === 'refresh_token') {
                    this.refreshToken = value;
                }
                this.refreshInputs[key] = value;
            }
        });
        return loginResult;
    }

    receiveLoginFail(loginFail) {
        console.error({ loginFail });
        this.logout();
    }

    logout(): void {
        this.loggedIn = false;
        this.loginArgs = {};
        this.refreshInputs = {};
        this.clearPersistedData();
    }

    importPersistedData(refreshInputs) {
        if (!this.persistKey) {
            return {};
        }
        const rawData = localStorage.getItem(this.persistKey);
        if (!rawData) {
            return {};
        }
        try {
            const jsonData = JSON.parse(rawData);
            Object.keys(jsonData).forEach((key: string) => {
                const value = jsonData[key];
                if (key === 'refresh_expiration') {
                    this.refreshExpiration = value && value < 10000000000 ? value * 1000 : value;
                } else if (key === 'jwt') {
                    if (!this.sessionState.header) {
                        this.sessionState.header = {};
                    }
                    this.registerJwt(value);
                } else {
                    if (this.refreshInputKeys.has(key)) {
                        refreshInputs[key] = value;
                    }
                }
            });
            return jsonData;
        } catch {
            console.error('Failed to parse persisted http2js data:', { rawData });
            return {};
        }
    }

    persistLoginResult(loginResult: any) {
        if (!this.persistKey) {
            return;
        }
        const values = this.importPersistedData({});
        [...this.refreshInputKeys, 'refresh_expiration', 'jwt'].forEach((key) => {
            if (loginResult[key]) {
                values[key] = loginResult[key];
            }
        });
        localStorage.setItem(this.persistKey, JSON.stringify(values));
    }

    clearPersistedData() {
        if (!this.persistKey) {
            return;
        }
        localStorage.removeItem(this.persistKey);
    }
}