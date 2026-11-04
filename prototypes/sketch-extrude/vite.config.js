export default {
  optimizeDeps: { exclude: ["replicad-opencascadejs"] },
  worker: { format: "es" },
  build: { target: "es2022" },
};
