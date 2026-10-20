let pending;
// Reuse the same request for navigation intent and the lazy route.
export const loadCasePage = () => {
  pending ||= import("./CasePage.jsx").catch((error) => {
    pending = null;
    throw error;
  });
  return pending;
};
