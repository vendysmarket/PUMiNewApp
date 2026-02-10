-- Create launch_waitlist table for email captures
CREATE TABLE public.launch_waitlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.launch_waitlist ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (public signup)
CREATE POLICY "Anyone can subscribe to waitlist"
ON public.launch_waitlist
FOR INSERT
WITH CHECK (true);

-- Prevent reading/updating/deleting (admin only via service role)
CREATE POLICY "No public read access"
ON public.launch_waitlist
FOR SELECT
USING (false);