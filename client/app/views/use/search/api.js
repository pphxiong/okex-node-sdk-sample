import wrapPromise from '@common/utils/wrapPromise';

import {fetchUsers} from '@app/api';

export const fetchList=wrapPromise(fetchUsers());





