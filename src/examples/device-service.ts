import { mkClientFromFile } from '../index';

const path: string = '/Users/Steve.Herzog/projects/otosense/device_svc_openapi.json';

const auth: any = {
    account: 'analogdevices_test',
    email: 'admin@user.test',
    password: 'admin_password',
};

const client: any = mkClientFromFile(path, auth);
client.list_devices().then((result) => console.log({ result }))
    .catch(console.error);
