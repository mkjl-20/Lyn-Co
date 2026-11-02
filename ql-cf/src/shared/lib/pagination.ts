export interface PaginationResult<T> {
  items: T[];
  page: number;
  totalPages: number;
  firstItem: number;
  lastItem: number;
}

export const DASHBOARD_PAGE_SIZE = 10;

export function paginateItems<T>(
  items: T[],
  requestedPage: number,
  pageSize = DASHBOARD_PAGE_SIZE,
): PaginationResult<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const firstItem = items.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, items.length);

  return {
    items: items.slice(firstItem === 0 ? 0 : firstItem - 1, page * pageSize),
    page,
    totalPages,
    firstItem,
    lastItem,
  };
}
