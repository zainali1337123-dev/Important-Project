// ─── Generic Service Layer ───
// All data operations flow through this interface.
// Implementation is private — consumers only see the API.

export const Service = {
  async list(_request: Request) {
    return { data: [] };
  },

  async create(_body: unknown) {
    return { success: true };
  },

  async update(_body: unknown) {
    return { success: true };
  },

  async remove(_id: string | null) {
    return { success: true };
  },
};
