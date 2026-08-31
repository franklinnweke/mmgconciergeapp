// Firebase deployment entrypoint. The explicit discovery export overrides the
// historical searchVehicles export from index so the deployed network boundary
// is schema-validated without duplicating the rest of the function surface.
export * from './index.js';
export {
  getVehicleDetails,
  searchVehicles,
} from './discovery/discovery-callables.js';
