import request from '@/utils/request';

const commonUrl = '/okex';

export async function postLeverage(params) {
  return request(`${commonUrl}/futures/postLeverage`, {
    params,
  });
}

