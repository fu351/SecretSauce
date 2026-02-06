// app/api/users/route.ts
import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';

export async function POST(req: Request) {
  try {
    const { userIds } = await req.json();
    if (!userIds || !Array.isArray(userIds)) {
      return new Response('User IDs are required', { status: 400 });
    }

    const users = await clerkClient.users.getUserList({
      userId: userIds,
    });

    const safeUserData = users.map(user => ({
        id: user.id,
        fullName: user.fullName,
        imageUrl: user.imageUrl,
        primaryEmailAddress: user.primaryEmailAddress?.emailAddress,
    }));

    return NextResponse.json(safeUserData);
  } catch (error) {
    console.error('Error fetching users:', error);
    return new Response('Error fetching users', { status: 500 });
  }
}
