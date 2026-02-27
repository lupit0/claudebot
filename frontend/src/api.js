import axios from 'axios';

const API = axios.create({ baseURL: '/api' });

export const fetchInquiries = (params) => API.get('/inquiries', { params });
export const fetchInquiry = (id) => API.get(`/inquiries/${id}`);
export const createInquiry = (data) => API.post('/inquiries', data);
export const updateInquiry = (id, data) => API.patch(`/inquiries/${id}`, data);
export const deleteInquiry = (id) => API.delete(`/inquiries/${id}`);

export const addCollateral = (inquiryId, data) => API.post(`/inquiries/${inquiryId}/collateral`, data);
export const removeCollateral = (inquiryId, itemId) => API.delete(`/inquiries/${inquiryId}/collateral/${itemId}`);

export const addResponse = (inquiryId, data) => API.post(`/inquiries/${inquiryId}/responses`, data);

export const uploadAttachment = (inquiryId, file) => {
  const form = new FormData();
  form.append('file', file);
  return API.post(`/inquiries/${inquiryId}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
export const deleteAttachment = (id) => API.delete(`/attachments/${id}`);
export const downloadAttachmentUrl = (id) => `/api/attachments/${id}/download`;

export const fetchStats = () => API.get('/stats');
export const fetchProductTypes = () => API.get('/reference/product-types');
export const fetchCurrencies = () => API.get('/reference/currencies');
export const fetchChannels = () => API.get('/reference/channels');
