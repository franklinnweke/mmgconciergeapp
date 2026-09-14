export type OwnerBookingsLoadState = {
  requestsLoading: boolean;
  bookingsLoading: boolean;
  requestsError: string | null;
  bookingsError: string | null;
};

export type OwnerBookingsLoadPresentation = {
  loading: boolean;
  errors: string[];
};

export function ownerBookingsLoadPresentation(
  state: OwnerBookingsLoadState,
): OwnerBookingsLoadPresentation {
  const errors: string[] = [];
  if (state.requestsError) errors.push(state.requestsError);
  if (state.bookingsError) errors.push(state.bookingsError);

  return {
    loading: state.requestsLoading || state.bookingsLoading,
    errors,
  };
}
