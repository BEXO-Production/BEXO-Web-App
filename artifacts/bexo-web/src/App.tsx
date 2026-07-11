import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';
import { OnboardingProvider } from './context/OnboardingContext';
import { OnboardingLayout } from './layouts/OnboardingLayout';

import Step1Phone from './pages/step-1';
import Step2Auth from './pages/step-2';
import Step3Info from './pages/step-3';
import Step4Resume from './pages/step-4';
import Step5Photo from './pages/step-5';
import Step6About from './pages/step-6';
import Step7Payment from './pages/step-7';
import Step8Theme from './pages/step-8';
import Step9Publish from './pages/step-9';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <Redirect to="/step/1" />} />
      <Route path="/step/:id">
        {params => {
          const stepId = parseInt(params.id, 10);
          
          if (stepId < 1 || stepId > 9) {
            return <Redirect to="/step/1" />;
          }

          return (
            <OnboardingLayout>
              <Switch>
                <Route path="/step/1" component={Step1Phone} />
                <Route path="/step/2" component={Step2Auth} />
                <Route path="/step/3" component={Step3Info} />
                <Route path="/step/4" component={Step4Resume} />
                <Route path="/step/5" component={Step5Photo} />
                <Route path="/step/6" component={Step6About} />
                <Route path="/step/7" component={Step7Payment} />
                <Route path="/step/8" component={Step8Theme} />
                <Route path="/step/9" component={Step9Publish} />
              </Switch>
            </OnboardingLayout>
          );
        }}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <OnboardingProvider>
            <Router />
          </OnboardingProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
