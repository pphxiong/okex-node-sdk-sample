import request from '@/utils/request';

const commonUrl = '/okex';

export async function getWallet(params) {
  return request(`${commonUrl}/account/getCurrencies`, {
    params,
  });
}
