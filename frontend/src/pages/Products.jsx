import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';

const Products = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />

      <div className="flex-1 ml-64 p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-gray-800">Products</h1>
            <button
              onClick={() => {/* TODO: Open create product modal */}}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-all flex items-center gap-2"
            >
              + Create
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <p className="text-sm text-gray-400 uppercase tracking-wide mb-1">PURCHASES</p>
              <p className="text-4xl font-bold text-gray-800">0</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <p className="text-sm text-gray-400 uppercase tracking-wide mb-1">REVENUE</p>
              <p className="text-4xl font-bold text-gray-800">₹0</p>
            </div>
          </div>

          {/* Products Table */}
          <div className="bg-white rounded-2xl shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-4 px-6 font-medium text-gray-500 text-sm">PRODUCT</th>
                    <th className="text-left py-4 px-6 font-medium text-gray-500 text-sm">PRICE</th>
                    <th className="text-left py-4 px-6 font-medium text-gray-500 text-sm">SALES</th>
                    <th className="text-left py-4 px-6 font-medium text-gray-500 text-sm">REVENUE</th>
                    <th className="text-left py-4 px-6 font-medium text-gray-500 text-sm">PAYMENTS</th>
                    <th className="text-left py-4 px-6 font-medium text-gray-500 text-sm">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-16">
                        <div className="text-center">
                          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                          </div>
                          <h3 className="text-lg font-semibold text-gray-800 mb-1">No products yet</h3>
                          <p className="text-gray-500 mb-4">Get started by creating your first digital product to sell.</p>
                          <button
                            onClick={() => {/* TODO: Open create product modal */}}
                            className="px-6 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-all"
                          >
                            + Create Product
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    products.map((product) => (
                      <tr key={product.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
                            <span className="font-medium text-gray-800">{product.name}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-gray-600">₹{product.price}</td>
                        <td className="py-4 px-6 text-gray-600">{product.sales}</td>
                        <td className="py-4 px-6 text-gray-600">₹{product.revenue}</td>
                        <td className="py-4 px-6 text-gray-600">{product.payments}</td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            <button className="px-3 py-1 text-sm border border-purple-200 text-purple-600 rounded-lg hover:bg-purple-50">
                              Leads Data
                            </button>
                            <button className="p-1 text-gray-400 hover:text-gray-600">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            <button className="p-1 text-gray-400 hover:text-gray-600">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between p-4 border-t border-gray-100">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                Rows per page:
                <select className="border border-gray-200 rounded px-2 py-1">
                  <option>10</option>
                  <option>25</option>
                  <option>50</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button className="w-8 h-8 flex items-center justify-center rounded bg-purple-600 text-white text-sm font-medium">
                  1
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Products;
