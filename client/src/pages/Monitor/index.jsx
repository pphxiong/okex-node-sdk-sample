import React, { useState, useEffect } from 'react';
import { Card, } from 'antd';
import SearchTable from '@/components/SearchTable';
import moment from "moment";
import { getOrders } from './api';
import { tradeTypeEnum } from '../config';

export default props => {
  const initData = async () => {
    const result = await getOrders({ instrument_id: 'BTC-USD-200821' });
    console.log(result)
    return result;
  }

  useEffect(()=>{
    // initData();
  })

  const columns = [{
    dataIndex: 'order_id',
    title: '订单ID'
  },{
    dataIndex: 'instrument_id',
    title: '合约ID'
  },{
    dataIndex: 'type',
    title: '交易类型',
    render: text=>tradeTypeEnum[text]
  },{
    dataIndex: 'contract_val',
    title: '合约数量'
  },{
    dataIndex: 'price_avg',
    title: '成交均价'
  },{
    dataIndex: 'timestamp',
    title: '成交时间',
    render: text=>moment(text).format('YYYY-MM-DD hh:mm:ss')
  },{
    dataIndex: 'leverage',
    title: '杠杆倍数'
  },{
    dataIndex: 'fee',
    title: '手续费'
  }];

  const responseHandler = data=>{
    return { records : data.order_info };
  }

  return <>
    <Card title={'交易记录'}>
      <SearchTable
        columns={columns}
        getList={initData}
        responseHandler={responseHandler}
        rowKey={"order_id"}
      />
    </Card>
  </>
}
