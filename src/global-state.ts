const globalState: any = {}

export function getGlobalState(key: string, defaultValue: any = null) {
    const value = !!globalState[key] ? globalState[key] : defaultValue
    if (!!value) {
        globalState[key] = value
    }
    return value
}
