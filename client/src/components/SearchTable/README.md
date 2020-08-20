ps:封装了 antd Table 数据与交互结合，最大程度复用

**接口定义**

```ts
export interface CustomTableProps {
  getList?: (params: object) => Promise<any>; // 获取数据的函数
  columns?: []; // 定义表结构
}
```

#### 使用方法

```tsx
import CustomTable, { initPageOption } from '@/components/CustomTable';
export default () => {
  return <SearchTable columns={[]} getList={} searchFieldList={[{}]} />;
};
```
