import React, { useState, useEffect } from 'react';
import { Table, Button, Popconfirm } from 'antd';
import { ColumnProps } from 'antd/lib/table';
import SchemaForm, { SchemaMarkupField as Field, FormButtonGroup, Submit } from '@formily/antd';
import { columnEllipsisHandler } from '@/utils/utils';

let rfTable: Function;

export const refreshTable = (refKey?: any,params?: object) => {
  setTimeout(() => {
    rfTable(refKey,params);
  });
};

export interface CustomTableProps {
  getList?: (params: object) => Promise<any>;
  columns?: ColumnProps<never>[];
  pagination?: object;
  searchFieldList?: Array<never> | [];
  responseHandler?: (params: object) => Promise<any>;
  showOperation?: Boolean;
  showRowSelection?: Boolean;
  showAdd?: Boolean;
  showDelete?: Boolean;
  addHandler: Function;
  deleteHandler: Function;
  Operation?: React.ReactNode;
  addDisabled?: Boolean;
  isParamsNotReady?: Boolean;
  onSelectChange?: Function;
  getCheckboxProps?: Function;
  defaultSelectedKeys?: Array<never> | [];
  hideDeletePop?: Boolean;
  childrenColumnName?: string;
  hidePagination?: Boolean;
  listParams?: object;
  rowSelection?: object;
  tableId?: any;
}

export default ({
  getList,
  columns,
  pagination,
  searchFieldList,
  responseHandler,
  showOperation,
  showRowSelection,
  addHandler,
  deleteHandler,
  Operation,
  showAdd,
  showDelete,
  addDisabled,
  isParamsNotReady,
  onSelectChange,
  getCheckboxProps,
  defaultSelectedKeys,
  hideDeletePop,
  childrenColumnName,
  hidePagination,
  defaultPagination,
  showSizeChanger,
  rowSelection = {},
  listParams = {},
  tableId,
  ...rest
}: CustomTableProps) => {
  const initPageOption = { current: 1, size: 10, currentPage: 1, pageSize: 10, pageNum: 1 }; // 后台分页参数怎么不统一啊。。
  const [dataSource, setDataSource] = useState({});
  const [loading, setLoading] = useState(false);
  const [searchValues, setSearchValues] = useState(initPageOption);
  const [selectedRowKeys, setSelectedRowKeys] = useState(defaultSelectedKeys || []);
  useEffect(() => {
    fnGetList(); // 请求接口
  }, [searchValues]);

  useEffect(() => {
    setSelectedRowKeys(defaultSelectedKeys || [])
  }, [defaultSelectedKeys]);

  function fnGetList(params?: object) {
    if (!isParamsNotReady && getList) {
      setLoading(true);
      getList({ ...listParams, ...searchValues, ...params })
        .then((res: any) => {
          try {
            const { data, records } = res;
            let newData = data || records || {};
            if(Array.isArray(newData)) newData = { records: newData };
            if (responseHandler) newData = responseHandler(newData);
            console.log(newData)
            setDataSource(newData || {});
          } catch (e) {
            console.log(e);
          }
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }

  rfTable = function (refKey?:any,params?: object) {
    console.log(refKey,tableId)
    if(refKey == tableId) fnGetList(params);
  };

  function handelPageChange(cr: number, ps?: number) {
    setSearchValues({
      ...searchValues,
      current: cr,
      size: ps || searchValues.size,
      currentPage: cr,
      pageSize: ps || searchValues.size,
      pageNum: cr,
    });
  }

  const handleSearch = function (values: object) {
    // 状态为-1或ALL，搜索全部状态
    Object.entries(values).map(([key,value])=>{
      if(value==="ALL"||value=='-1') delete values[key];
    })
    setSearchValues({
      ...values,
      ...initPageOption,
    });
  };

  const getSearchForm = () => (
    <SchemaForm previewPlaceholder={<span style={{ display: 'inline-block' }} />} inline onSubmit={handleSearch}>
      {searchFieldList && searchFieldList.map((it:object,index:number) => <Field {...it} key={it.name||index}/>)}
      <FormButtonGroup>
        <Submit>查询</Submit>
        {/* <Reset></Reset> */}
      </FormButtonGroup>
    </SchemaForm>
  );

  const handleRowSelectChange = (selectedRowKeys: any[], selectedRows: any[]) => {
    setSelectedRowKeys(selectedRowKeys);
    if (onSelectChange) onSelectChange(selectedRowKeys, selectedRows)
  };

  const getChildrenIds = (id: any, records: any[], ids: any[]) => {
    ids.push(id);
    const childrenKey = childrenColumnName || 'children';
    const record = records.find((item: any) => item.id === id);
    if (record && record[childrenKey]) {
      record[childrenKey].map((item: any) => ids.concat(getChildrenIds(item.id, record[childrenKey], ids)))
    }

    return ids;
  }

  const onSelect = (record: object, selected: any[], selectedRows: any[], event: object) => {
    // 选中或取消该节点的所有子节点ids
    let ids = [];
    if(record.children && record.children.length) {
      if (selected) {
        ids = getChildrenIds(record.id, selectedRows, [])
        setSelectedRowKeys(Array.from(new Set(selectedRowKeys.concat(ids))))
      } else {
        ids = getChildrenIds(record.id, selectedRows.concat([record]), [])

        const aSet = new Set(selectedRowKeys)
        const bSet = new Set(ids)

        const differenceNew = Array.from(new Set(selectedRowKeys.concat(ids).filter(v => aSet.has(v) && !bSet.has(v))));
        setSelectedRowKeys(differenceNew);
      }
    }
  }

  const customRowSelection = {
    selectedRowKeys,
    onChange: handleRowSelectChange,
    getCheckboxProps,
    onSelect,
    ...rowSelection,
    // getCheckboxProps: record => ({
    //   disabled: record.disabled,
    // }),
  };

  const batchDelete = () => {
    deleteHandler && deleteHandler(selectedRowKeys);
    // 删除后清空选中项
    setSelectedRowKeys(defaultSelectedKeys || []);
  }

  const getOperation = () => (
    <>
      {showAdd && (
        <Button icon="folder-add" type="primary" onClick={() => addHandler && addHandler()} disabled={addDisabled}>
          新建
        </Button>
      )}

      {showDelete && (
        hideDeletePop ? (<Button style={{ marginLeft: 8 }} disabled={selectedRowKeys.length < 1} onClick={() => deleteHandler && deleteHandler(selectedRowKeys)}>
          批量删除
        </Button>) : (<Popconfirm
          title="确定删除？"
          onConfirm={() => batchDelete()}
          // onCancel={cancel}
          okText="确定"
          cancelText="取消"
          disabled={selectedRowKeys.length < 1}
        >
          <Button style={{ marginLeft: 8 }} disabled={selectedRowKeys.length < 1}>
            批量删除
          </Button>
        </Popconfirm>)
      )}
    </>
  );

  const newPagination= hidePagination ?  false : {
    showTotal: (total:any) => `共计${total}条数据`,
    total: dataSource.total || 0,
    current: searchValues.current,
    pageSize: searchValues.size,
    onChange: handelPageChange,
    onShowSizeChange: handelPageChange,
    pageSizeOptions: ['10', '20', '30', '40'],
    showQuickJumper: true,
    showSizeChanger: showSizeChanger==null?true:showSizeChanger,
    ...(pagination || {}),
  }

  rest=defaultPagination?rest:{
    ...rest,
    pagination:newPagination,
  };

  return (
    <div>
      <div style={{ float: 'left' }}>{Operation}</div>
      <div style={{ float: 'left' }}>{showOperation && getOperation()}</div>
      <div style={{ float: 'right' }}>{searchFieldList && getSearchForm()}</div>
      <div style={{ clear: 'both', paddingBottom: 10 }} />
      {/* <Table
        columns={columns}
        size="small"
        loading={loading}
        dataSource={dataSource}
        pagination={{
          total: dataSource.length,
          hideOnSinglePage: true,
          current: searchValues.current,
          pageSize: searchValues.pageSize,
          onChange: handelPageChange,
          onShowSizeChange: handelPageChange,
          pageSizeOptions: ['10', '20', '30', '40'],
          showQuickJumper: true,
          showSizeChanger: true,
          ...(pagination || {}),
        }}
        {...rest}
      /> */}
      <Table
        columns={columnEllipsisHandler(columns)}
        size="small"
        loading={loading}
        dataSource={dataSource.records || []}
        // pagination={newPagination}
        rowSelection={showRowSelection ? customRowSelection : null}
        rowKey="id"
        {...rest}
      />
    </div>
  );
};
