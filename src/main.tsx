import ReactDOM from "react-dom/client";
import App from "./App";
import { Provider } from "./components/ui/provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds default
      gcTime: 1000 * 60 * 5, // 5 minutes (formerly cacheTime)
      retry: false, // Don't retry failed requests by default
      refetchOnWindowFocus: false, // Don't refetch on window focus for etcd
    },
  },
});
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <Provider>
      <App />
    </Provider>
  </QueryClientProvider>
);
