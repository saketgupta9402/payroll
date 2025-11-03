import { useQuery } from "@tanstack/react-query";
// Fix: Use the correct path alias for your project
import { api, type Session as ApiSession } from "@/lib/api";

export const useAuth = () => {
  const { data, isLoading, isError } = useQuery({
    // The queryKey uniquely identifies this query
    queryKey: ["session"],
    
    // The queryFn is the async function to fetch the data
    queryFn: api.auth.session,

    // --- Recommended configuration for auth queries ---
    
    // Don't automatically retry failed auth checks (if they're unauth, they're unauth)
    retry: false,
    
    // Cache the session data for 5 minutes
    staleTime: 5 * 60 * 1000, // 5 minutes
    
    // Keep the data in memory for 15 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes

    // Re-check the session when the user focuses the browser window
    refetchOnWindowFocus: true,
  });

  return {
    session: (data?.session ?? null) as ApiSession | null,
    loading: isLoading,
    isError: isError,
  };
};

