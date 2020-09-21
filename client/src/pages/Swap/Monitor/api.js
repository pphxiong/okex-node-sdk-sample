import request from '@/utils/request';

const commonUrl = '/okex';

export async function getWallet(params) {
  return request(`${commonUrl}/account/getCurrencies`, {
    params,
  });
}

export async function getOrders(params) {
  return request(`${commonUrl}/futures/getOrders`, {
    params,
  });
}

export async function getFuturesInformation(params) {
  return request(`${commonUrl}/futures/information`, {
    params,
  });
}

export async function getFuturesInformationSentiment(params) {
  return request(`${commonUrl}/futures/information/sentiment`, {
    params,
  });
}

export async function getTradeFee(params) {
  return request(`${commonUrl}/futures/getTradeFee`, {
    params,
  });
}
