import request from '@/utils/request';

export async function fakeAccountLogin(params) {
  // return request('/api/login/account', {
  //   method: 'POST',
  //   data: params,
  // });
  return Promise.resolve({"status":"ok","type":"account","currentAuthority":"admin"})
}
export async function getFakeCaptcha(mobile) {
  return request(`/api/login/captcha?mobile=${mobile}`);
}
