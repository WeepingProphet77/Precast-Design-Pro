
import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useProject } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const projectSchema = z.object({
  jobName: z.string().min(1, "Job name is required"),
  jobNumber: z.string().min(1, "Job number is required"),
  engineer: z.string().min(1, "Engineer name is required"),
  location: z.string().min(1, "Location is required"),
  date: z.string(),
  designStandard: z.enum(["ASCE7-16", "ASCE7-22"]),
  designMethod: z.enum(["LRFD", "ASD"]),
});

export default function ProjectInfo() {
  const { project, updateProjectInfo } = useProject();

  const form = useForm({
    resolver: zodResolver(projectSchema),
    defaultValues: project.info,
  });

  const onSubmit = (data: z.infer<typeof projectSchema>) => {
    updateProjectInfo(data);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Project Configuration</h1>
        <p className="text-muted-foreground mt-2">Enter the general information for this structural analysis project.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General Information</CardTitle>
          <CardDescription>This information will appear on all calculation reports.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onChange={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="jobName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Job Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="jobNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Job Number</FormLabel>
                      <FormControl>
                        <Input {...field} className="font-mono" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="engineer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Engineer of Record</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Site Location</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="designStandard"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Design Standard</FormLabel>
                      <Select onValueChange={(val) => { field.onChange(val); setTimeout(() => form.handleSubmit(onSubmit)(), 0); }} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="ASCE7-16">ASCE 7-16</SelectItem>
                          <SelectItem value="ASCE7-22">ASCE 7-22</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="designMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Design Method</FormLabel>
                      <Select onValueChange={(val) => { field.onChange(val); setTimeout(() => form.handleSubmit(onSubmit)(), 0); }} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="LRFD">Strength Design (Section 2.3)</SelectItem>
                          <SelectItem value="ASD">Allowable Stress Design (Section 2.4)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
