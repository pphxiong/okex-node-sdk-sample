import request from '@/utils/request';

const commonUrl = '/okex';

export async function postLeverage(params) {
  return request(`${commonUrl}/futures/postLeverage`, {
    params,
  });
}

export async function postSwapLeverage(params) {
  return request(`${commonUrl}/swap/postLeverage`, {
    params,
  });
}
