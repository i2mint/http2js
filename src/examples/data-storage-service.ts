import { mkClientFromFile } from '../index';

const path: string = './resources/data-storage-svc-openapi.json';

const auth: any = {
    account: 'analogdevices_test',
    email: 'admin@user.test',
    password: 'admin_password',
};

const client: any = mkClientFromFile(path, auth);
client.sign_audio_url({'session_id': '40FWF4_R-_1580755797944117', 'bt': 0}).then((result) => console.log({ result }))
    .catch(console.error);
